"""
Original leveled passages written for ReadAlong (MIT licensed with the repo).
Each has comprehension questions Pip asks after the reading.
"""

PASSAGES = [
    {
        "id": "big-red-hen",
        "title": "The Big Red Hen",
        "grade": 1,
        "emoji": "🐔",
        "color": "#F4A259",
        "text": (
            "Meg has a big red hen. The hen likes to sit in the sun. "
            "One day the hen sat on a hat. Meg could not find her hat. "
            "She looked in the shed and under the bed. "
            "Then she saw the hen. The hen was on the hat, and under the hen was an egg!"
        ),
        "questions": [
            "What did Meg lose?",
            "What did Meg find under the hen?",
        ],
    },
    {
        "id": "sam-and-the-kite",
        "title": "Sam and the Kite",
        "grade": 1,
        "emoji": "🪁",
        "color": "#5B8E7D",
        "text": (
            "Sam has a green kite. He runs up the hill with it. "
            "The wind is strong. The kite goes up and up. "
            "Then the string slips from his hand! The kite flies over the trees. "
            "Sam runs fast. He finds the kite in a tree next to a little nest. "
            "His dad helps him get it down."
        ),
        "questions": [
            "What happened to Sam's kite?",
            "Who helped Sam get the kite down?",
        ],
    },
    {
        "id": "thirsty-elephant",
        "title": "The Thirsty Elephant",
        "grade": 2,
        "emoji": "🐘",
        "color": "#8C7AA9",
        "text": (
            "The enormous elephant walked slowly through the quiet forest, looking for water. "
            "She was very thirsty. The river had dried up in the hot summer sun. "
            "She lifted her long trunk and sniffed the air. "
            "Far away, she could smell rain. The elephant followed the smell for three days. "
            "At last she found a cool, deep lake. She drank and drank, "
            "and then she sprayed water over her back."
        ),
        "questions": [
            "Why did the elephant go looking for water?",
            "How did she find the lake?",
        ],
    },
    {
        "id": "lunchbox-mystery",
        "title": "The Lunchbox Mystery",
        "grade": 2,
        "emoji": "🥪",
        "color": "#E07A5F",
        "text": (
            "Every day at noon, Jada opened her lunchbox and found something missing. "
            "On Monday, her apple was gone. On Tuesday, her crackers were gone. "
            "Jada decided to be a detective. She hid behind the big oak tree and waited. "
            "Soon a small gray squirrel climbed down the branch. "
            "It crept into her open bag and grabbed a cracker. "
            "Jada laughed. From then on, she packed an extra snack for her new friend."
        ),
        "questions": [
            "What kept going missing from Jada's lunchbox?",
            "Who was taking the food, and what did Jada do about it?",
        ],
    },
    {
        "id": "night-garden",
        "title": "The Night Garden",
        "grade": 3,
        "emoji": "🌙",
        "color": "#3D5A80",
        "text": (
            "Most people think a garden falls asleep when the sun goes down, but that is not true. "
            "Some flowers, like the moonflower, open only at night. "
            "Their bright white petals shine in the dark so that moths can find them. "
            "Moths drink the sweet nectar and carry pollen from flower to flower. "
            "Bats visit night gardens too, catching insects as they fly. "
            "If you sit quietly outside on a warm evening, you might discover "
            "a whole busy world that most people never notice."
        ),
        "questions": [
            "Why are moonflower petals bright white?",
            "Name one animal that visits a garden at night and what it does there.",
        ],
    },
    {
        "id": "robot-who-could-not-dance",
        "title": "The Robot Who Could Not Dance",
        "grade": 3,
        "emoji": "🤖",
        "color": "#98C1D9",
        "text": (
            "Bolt was a helper robot at the town library. He could sort books, "
            "fix broken shelves, and remember every title ever written. "
            "But when the children held a dance party, Bolt just stood still. "
            "His metal legs clanked and his arms moved in stiff squares. "
            "A girl named Rosa took his hand. Dancing is not about being perfect, she told him. "
            "It is about having fun. Bolt tried again, wobbling and spinning. "
            "Everyone cheered, and for the first time, Bolt felt his lights glow with joy."
        ),
        "questions": [
            "What was Bolt good at, and what was hard for him?",
            "What did Rosa teach Bolt about dancing?",
        ],
    },
    {
        "id": "volcano-island",
        "title": "How an Island Is Born",
        "grade": 4,
        "emoji": "🌋",
        "color": "#C0504D",
        "text": (
            "Deep beneath the ocean floor, melted rock called magma pushes upward through cracks in the earth. "
            "When it bursts out, it cools quickly in the cold seawater and hardens into new rock. "
            "Over thousands of years, eruption after eruption, the pile of rock grows taller. "
            "Eventually it rises above the waves, and a new island appears. "
            "At first the island is bare and black, but seeds carried by birds and ocean currents "
            "soon arrive. Plants take root, insects follow, and slowly the lifeless rock "
            "becomes a living home for many creatures."
        ),
        "questions": [
            "What is magma, and what happens when it reaches cold seawater?",
            "How do plants first get to a brand new island?",
        ],
    },
    {
        "id": "brave-little-lighthouse",
        "title": "The Lighthouse Keeper",
        "grade": 4,
        "emoji": "🗼",
        "color": "#2A9D8F",
        "text": (
            "For forty years, Grandpa Eli kept the lighthouse on the rocky point. "
            "Every evening he climbed one hundred and twelve steps to light the great lamp. "
            "One stormy night, the power failed across the whole coast. "
            "Eli could hear a fishing boat's horn somewhere in the darkness. "
            "Without hesitating, he grabbed an old oil lantern, polished the mirrors by hand, "
            "and lit the flame. The beam swept across the waves once more. "
            "Hours later, the tired fishermen knocked on his door to thank the man "
            "whose light had guided them safely home."
        ),
        "questions": [
            "What problem happened on the stormy night?",
            "How did Grandpa Eli solve it, and why did the fishermen thank him?",
        ],
    },
]

BY_ID = {p["id"]: p for p in PASSAGES}
