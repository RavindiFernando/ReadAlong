"""
AssemblyAI Universal-3 Pro streaming, tuned to hear reading mistakes.

The SDK client runs its own threads; turn events are handed back to the
asyncio loop through a queue. Word timestamps are relative to the first
audio byte, which is also byte 0 of the saved WAV, so replay lines up.
"""

import asyncio
import os

from assemblyai.streaming.v3 import (
    Encoding,
    StreamingClient,
    StreamingClientOptions,
    StreamingEvents,
    StreamingParameters,
    TurnEvent,
)

SAMPLE_RATE = 16_000
MODEL = os.environ.get("STT_MODEL", "universal-3-6-pro")

# Without this prompt the model "helps" by cleaning up stumbles, which hides
# exactly what a reading teacher needs to see. We deliberately do NOT put the
# passage in the prompt: in testing that made the model transcribe what the
# child should have said instead of what they did say.
VERBATIM_PROMPT = (
    "Transcribe verbatim exactly as spoken by a child reading aloud. Keep repetitions, "
    "false starts, partial words and mispronounced or wrong words. Never correct grammar "
    "or word choice."
)


class ReadingStream:
    def __init__(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue):
        self.loop = loop
        self.queue = queue
        self.turns: dict[int, TurnEvent] = {}
        self.client = StreamingClient(StreamingClientOptions(api_key=os.environ["ASSEMBLYAI_API_KEY"]))
        self.client.on(StreamingEvents.Turn, self._on_turn)
        self.client.on(StreamingEvents.Error, self._on_error)

    def _on_turn(self, _client, event: TurnEvent):
        self.turns[event.turn_order] = event
        self.loop.call_soon_threadsafe(self.queue.put_nowait, ("turn", None))

    def _on_error(self, _client, error):
        self.loop.call_soon_threadsafe(self.queue.put_nowait, ("error", str(error)))

    def connect(self):
        self.client.connect(StreamingParameters(
            sample_rate=SAMPLE_RATE,
            encoding=Encoding.pcm_s16le,
            speech_model=MODEL,
            prompt=VERBATIM_PROMPT,
            # Children pause mid-sentence; don't end turns too eagerly.
            min_turn_silence=700,
            max_turn_silence=2500,
        ))

    def send(self, pcm: bytes):
        self.client.stream(pcm)

    def close(self):
        """Blocking: flushes the last turn, then closes."""
        self.client.disconnect(terminate=True)

    def words(self) -> tuple[list[dict], list[dict]]:
        """(settled words in order, still-changing words of the open turn)."""
        settled, partial = [], []
        for order in sorted(self.turns):
            turn = self.turns[order]
            for w in turn.words:
                item = {"text": w.text, "start": w.start, "end": w.end, "confidence": w.confidence}
                if turn.end_of_turn or w.word_is_final:
                    settled.append(item)
                else:
                    partial.append(item)
        return settled, partial
