import { useEffect, useState } from "react";
import Pip from "./components/Pip";
import Home from "./pages/Home";
import Library from "./pages/Library";
import Reader from "./pages/Reader";
import Teacher from "./pages/Teacher";
import StudentDetail from "./pages/StudentDetail";
import SessionReplay from "./pages/SessionReplay";

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export default function App() {
  const [section, a, b] = useRoute();
  const teacher = section === "teacher" || section === "session";

  let page;
  if (section === "read" && a && b) page = <Reader key={`${a}/${b}`} studentId={a} passageId={b} />;
  else if (section === "read" && a) page = <Library studentId={a} />;
  else if (section === "teacher" && a) page = <StudentDetail key={a} studentId={a} />;
  else if (section === "teacher") page = <Teacher />;
  else if (section === "session" && a) page = <SessionReplay key={a} sessionId={a} />;
  else page = <Home />;

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <Pip size={40} />
          <span className="brand-name">
            Read<span>Along</span>
          </span>
        </a>
        <nav className="mode-switch" aria-label="Mode">
          <a href="#/" className={teacher ? "" : "on"}>
            Kids
          </a>
          <a href="#/teacher" className={teacher ? "on" : ""}>
            Grown-ups
          </a>
        </nav>
      </header>
      <main>{page}</main>
    </div>
  );
}
