import { useState, useEffect } from "react";

const GRID_SIZE = 6;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

const LEVELS = {
  easy: {
    label: "Makkelijk",
    emoji: "🌱",
    color: "#4ade80",
    glow: "rgba(74,222,128,0.4)",
    mines: 4,
    description: "Eenvoudige breuken\nOptelling & aftrekking",
    prompt: `Genereer 20 unieke breuk-oefeningen voor leerlingen van het 1e jaar secundair.
Gebruik ALLEEN eenvoudige optelling en aftrekking van breuken met kleine noemers (2, 3, 4, 6, 8).
Voorbeelden: 1/2 + 1/4, 3/4 - 1/4, 2/3 + 1/6`,
  },
  medium: {
    label: "Gemiddeld",
    emoji: "🔥",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.4)",
    mines: 6,
    description: "Grotere noemers\nVermenigvuldiging erbij",
    prompt: `Genereer 20 unieke breuk-oefeningen voor leerlingen van het 1e of 2e jaar secundair.
Gebruik optelling, aftrekking en vermenigvuldiging van breuken met noemers tot 12.
Wissel af tussen bewerkingstypes. Voorbeelden: 3/8 + 5/12, 2/3 × 3/4, 7/10 - 1/4`,
  },
  hard: {
    label: "Moeilijk",
    emoji: "💀",
    color: "#f87171",
    glow: "rgba(248,113,113,0.4)",
    mines: 9,
    description: "Gemengde bewerkingen\nDeling & complexe noemers",
    prompt: `Genereer 20 unieke breuk-oefeningen voor uitdagende leerlingen van het 2e jaar secundair.
Gebruik alle bewerkingen: optelling, aftrekking, vermenigvuldiging én deling van breuken.
Gebruik grotere en onregelmatige noemers (tot 20). Voeg ook enkele gemengde getallen toe.
Voorbeelden: 5/6 ÷ 2/3, 1 1/2 + 3/4, 7/12 × 4/5, 11/15 - 2/9`,
  },
};

async function fetchAIQuestions(level) {
  const cfg = LEVELS[level];
  const response = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `${cfg.prompt}
Geef ALLEEN een JSON-array terug, geen uitleg, geen markdown, geen backticks.
Elk object heeft deze structuur:
{"question": "1/2 + 1/4 = ?", "options": ["3/4", "2/6", "1/3", "2/4"], "answer": "3/4"}
Regels:
- "answer" moet altijd in "options" staan
- Geef altijd 4 opties, waarvan 1 correct
- Vereenvoudig het antwoord waar mogelijk (bv. 2/4 moet 1/2 worden)
- Alle 20 vragen moeten verschillend zijn`,
      }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error("HTTP " + response.status + ": " + err);
  }
  const data = await response.json();
  const text = data.content.map(i => i.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function parseFraction(str) {
  str = str.trim().replace(",", ".");
  const mixed = str.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  if (str.includes("/")) {
    const [num, den] = str.split("/").map(s => parseFloat(s.trim()));
    return num / den;
  }
  return parseFloat(str);
}

function fractionsEqual(a, b) {
  return Math.abs(parseFraction(a) - parseFraction(b)) < 0.0001;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createBoard(questions, mineCount) {
  const mineIndices = new Set();
  while (mineIndices.size < mineCount) {
    mineIndices.add(Math.floor(Math.random() * TOTAL_CELLS));
  }
  const shuffled = shuffle(questions);
  return Array.from({ length: TOTAL_CELLS }, (_, i) => ({
    id: i,
    isMine: mineIndices.has(i),
    revealed: false,
    question: shuffled[i % shuffled.length],
  }));
}

export default function MijnenVeger() {
  const [screen, setScreen] = useState("menu");
  const [level, setLevel] = useState(null);
  const [board, setBoard] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeCell, setActiveCell] = useState(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [explodingCell, setExplodingCell] = useState(null);
  const [correctCell, setCorrectCell] = useState(null);
  const [wrongAnswer, setWrongAnswer] = useState(false);
  const [penaltyFlash, setPenaltyFlash] = useState(false);
  const [scorePopup, setScorePopup] = useState(null);
  const [combo, setCombo] = useState(0);

  const startGame = async (lvl) => {
    setLevel(lvl);
    setScreen("loading");
    setBoard(null);
    setScore(0);
    setLives(3);
    setCombo(0);
    setActiveCell(null);
    try {
      const questions = await fetchAIQuestions(lvl);
      setBoard(createBoard(questions, LEVELS[lvl].mines));
      setScreen("playing");
    } catch (e) {
      setErrorMsg(e.message || "Onbekende fout");
      setScreen("error");
    }
  };

  const cfg = level ? LEVELS[level] : LEVELS.easy;
  const mineCount = cfg.mines;
  const safeRevealed = board ? board.filter(c => c.revealed && !c.isMine).length : 0;
  const totalSafe = TOTAL_CELLS - mineCount;

  useEffect(() => {
    if (board && safeRevealed === totalSafe && screen === "playing") {
      setScreen("won");
    }
  }, [safeRevealed, screen, board]);

  const handleCellClick = (cell) => {
    if (screen !== "playing" || cell.revealed) return;
    if (cell.isMine) {
      setExplodingCell(cell.id);
      const newLives = lives - 1;
      setLives(newLives);
      setCombo(0);
      setTimeout(() => {
        setExplodingCell(null);
        setBoard(b => b.map(c => c.id === cell.id ? { ...c, revealed: true } : c));
        if (newLives <= 0) setScreen("lost");
      }, 900);
    } else {
      setActiveCell(cell);
    }
  };

  const handleAnswer = (cell, answer) => {
    const correct = fractionsEqual(answer, cell.question.answer);
    setActiveCell(null);
    if (correct) {
      const points = 100 + combo * 20;
      setCorrectCell(cell.id);
      setScore(s => s + points);
      setScorePopup({ cellId: cell.id, points, combo });
      setTimeout(() => setScorePopup(null), 1000);
      setCombo(c => c + 1);
      setTimeout(() => {
        setCorrectCell(null);
        setBoard(b => b.map(c => c.id === cell.id ? { ...c, revealed: true } : c));
      }, 800);
    } else {
      setWrongAnswer(true);
      setPenaltyFlash(true);
      setCombo(0);
      setScore(s => Math.max(0, s - 25));
      setTimeout(() => { setWrongAnswer(false); setPenaltyFlash(false); }, 700);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 50%, #0a0a1a 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace",
      padding: "20px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.015) 2px, rgba(0,255,100,0.015) 4px)",
      }} />

      <div style={{ textAlign: "center", marginBottom: screen === "menu" ? "32px" : "20px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "6px", color: "#4ade80", textTransform: "uppercase", marginBottom: "6px", opacity: 0.7 }}>
          WISKUNDE ARCADE
        </div>
        <h1 style={{
          fontSize: "clamp(24px, 5vw, 38px)", fontWeight: "900",
          color: "#fff", margin: 0, letterSpacing: "2px",
          textShadow: "0 0 30px rgba(74,222,128,0.5), 0 0 60px rgba(74,222,128,0.2)",
        }}>
          💣 BREUKENVEGER
        </h1>
      </div>

      {screen === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", animation: "fadeIn 0.3s ease" }}>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", letterSpacing: "3px", marginBottom: "8px" }}>
            KIES JE NIVEAU
          </div>
          {Object.entries(LEVELS).map(([key, lvl]) => (
            <button
              key={key}
              onClick={() => startGame(key)}
              style={{
                width: "280px", padding: "20px 28px",
                background: "rgba(255,255,255,0.04)",
                border: `2px solid ${lvl.color}44`,
                borderRadius: "14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "16px",
                transition: "all 0.2s", textAlign: "left",
                fontFamily: "'Courier New', monospace",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${lvl.color}18`;
                e.currentTarget.style.borderColor = lvl.color;
                e.currentTarget.style.boxShadow = `0 0 20px ${lvl.glow}`;
                e.currentTarget.style.transform = "scale(1.03)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.borderColor = `${lvl.color}44`;
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <span style={{ fontSize: "32px" }}>{lvl.emoji}</span>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "900", color: lvl.color, letterSpacing: "1px" }}>
                  {lvl.label}
                </div>
                {lvl.description.split("\n").map((line, i) => (
                  <div key={i} style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{line}</div>
                ))}
                <div style={{ fontSize: "10px", color: `${lvl.color}99`, marginTop: "4px" }}>
                  💣 {lvl.mines} mijnen
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {screen === "playing" && board && (
        <>
          <div style={{
            display: "flex", gap: "20px", marginBottom: "20px",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${cfg.color}33`,
            borderRadius: "12px", padding: "12px 24px",
          }}>
            <div style={{ position: "relative", textAlign: "center" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(255,255,255,0.35)", marginBottom: "2px" }}>SCORE</div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: cfg.color }}>{score}</div>
              {penaltyFlash && (
                <div style={{
                  position: "absolute", top: "-18px", left: "50%", transform: "translateX(-50%)",
                  color: "#f87171", fontWeight: "900", fontSize: "14px", whiteSpace: "nowrap",
                  animation: "floatUp 0.7s ease forwards",
                }}>-25</div>
              )}
            </div>
            <Divider />
            <HudItem label="LEVENS" value={"❤️".repeat(lives) + "🖤".repeat(3 - lives)} color="#f87171" />
            <Divider />
            <HudItem label="VEILIG" value={`${safeRevealed}/${totalSafe}`} color="#60a5fa" />
            <Divider />
            <HudItem label="NIVEAU" value={`${cfg.emoji} ${cfg.label}`} color={cfg.color} />
            {combo > 1 && <><Divider /><HudItem label="COMBO" value={`x${combo}`} color="#fbbf24" /></>}
          </div>

          <div style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gap: "6px", padding: "16px",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${cfg.color}22`,
            borderRadius: "16px",
            boxShadow: "0 0 40px rgba(0,0,0,0.5)",
          }}>
            {board.map(cell => (
              <Cell
                key={cell.id}
                cell={cell}
                onClick={() => handleCellClick(cell)}
                exploding={explodingCell === cell.id}
                correct={correctCell === cell.id}
                accentColor={cfg.color}
              />
            ))}
            {scorePopup && <ScorePopup popup={scorePopup} color={cfg.color} />}
          </div>

          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", letterSpacing: "2px", textTransform: "uppercase" }}>
              Klik een tegel → los de som op → vermijd de mijnen!
            </div>
            <button
              onClick={() => setScreen("menu")}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "11px", padding: "4px 10px", fontFamily: "'Courier New', monospace" }}
            >
              ← MENU
            </button>
          </div>
        </>
      )}

      {activeCell && (
        <Modal>
          <div style={{ fontSize: "11px", letterSpacing: "4px", color: cfg.color, marginBottom: "12px", opacity: 0.8 }}>BREUK GEVONDEN</div>
          <div style={{
            fontSize: "clamp(22px, 4vw, 32px)", fontWeight: "800",
            color: "#fff", marginBottom: "28px",
            textShadow: `0 0 20px ${cfg.glow}`,
          }}>
            {activeCell.question.question}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%" }}>
            {activeCell.question.options.map((opt, i) => (
              <AnswerButton key={i} label={opt} onClick={() => handleAnswer(activeCell, opt)} shake={wrongAnswer} color={cfg.color} />
            ))}
          </div>
          <button
            onClick={() => setActiveCell(null)}
            style={{ marginTop: "16px", background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "12px", letterSpacing: "2px" }}
          >
            ✕ ANNULEER
          </button>
        </Modal>
      )}

      {screen === "loading" && (
        <Modal>
          <div style={{ fontSize: "48px", marginBottom: "16px", animation: "spin 1.5s linear infinite", display: "inline-block" }}>⚙️</div>
          <div style={{ fontSize: "14px", letterSpacing: "3px", color: "#4ade80", marginBottom: "8px" }}>VRAGEN GENEREREN...</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
            AI maakt {level && LEVELS[level].emoji} {level && LEVELS[level].label} breuksommen voor jou
          </div>
        </Modal>
      )}

      {screen === "error" && (
        <Modal>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>⚠️</div>
          <div style={{ fontSize: "18px", fontWeight: "900", color: "#f87171", marginBottom: "8px" }}>LADEN MISLUKT</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "16px", wordBreak: "break-all", maxWidth: "280px" }}>{errorMsg}</div>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button onClick={() => startGame(level)} style={primaryBtn(cfg.color)}>🔄 OPNIEUW</button>
            <button onClick={() => setScreen("menu")} style={secondaryBtn}>← MENU</button>
          </div>
        </Modal>
      )}

      {screen === "lost" && (
        <Modal>
          <div style={{ fontSize: "60px", marginBottom: "8px" }}>💥</div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#f87171", marginBottom: "8px", letterSpacing: "2px" }}>GAME OVER</div>
          <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Eindscore</div>
          <div style={{ fontSize: "40px", fontWeight: "900", color: "#fff", marginBottom: "24px" }}>{score}</div>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button onClick={() => startGame(level)} style={primaryBtn(cfg.color)}>🔄 OPNIEUW</button>
            <button onClick={() => setScreen("menu")} style={secondaryBtn}>← MENU</button>
          </div>
        </Modal>
      )}

      {screen === "won" && (
        <Modal>
          <div style={{ fontSize: "60px", marginBottom: "8px" }}>🏆</div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: cfg.color, marginBottom: "8px", letterSpacing: "2px" }}>GEWONNEN!</div>
          <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Eindscore</div>
          <div style={{ fontSize: "40px", fontWeight: "900", color: "#fff", marginBottom: "8px" }}>{score}</div>
          <div style={{ fontSize: "13px", color: cfg.color, marginBottom: "24px" }}>{cfg.emoji} {cfg.label}</div>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button onClick={() => startGame(level)} style={primaryBtn(cfg.color)}>🎮 OPNIEUW</button>
            <button onClick={() => setScreen("menu")} style={secondaryBtn}>← MENU</button>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
        }
        @keyframes explode {
          0%{transform:scale(1)} 30%{transform:scale(1.4);box-shadow:0 0 30px #ef4444} 60%{transform:scale(0.9)} 100%{transform:scale(1)}
        }
        @keyframes correctPop {
          0%{transform:scale(1)} 25%{transform:scale(1.3)} 60%{transform:scale(0.95)} 100%{transform:scale(1)}
        }
        @keyframes fadeIn {
          from{opacity:0;transform:scale(0.95) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)}
        }
        @keyframes floatUp {
          0%{opacity:1;transform:translateX(-50%) translateY(0)} 100%{opacity:0;transform:translateX(-50%) translateY(-24px)}
        }
        @keyframes spin {
          from{transform:rotate(0deg)} to{transform:rotate(360deg)}
        }
      `}</style>
    </div>
  );
}

function ScorePopup({ popup, color }) {
  const col = popup.cellId % GRID_SIZE;
  const row = Math.floor(popup.cellId / GRID_SIZE);
  const cellSize = 66;
  const offsetX = (col - GRID_SIZE / 2 + 0.5) * cellSize;
  const offsetY = (row - GRID_SIZE / 2 - 0.5) * cellSize;
  const isCombo = popup.combo >= 2;
  return (
    <div style={{
      position: "absolute",
      left: `calc(50% + ${offsetX}px)`,
      top: `calc(50% + ${offsetY}px)`,
      transform: "translateX(-50%)",
      pointerEvents: "none", zIndex: 50,
      animation: "floatUp 1s ease forwards",
      whiteSpace: "nowrap", textAlign: "center",
    }}>
      <div style={{
        fontSize: "15px", fontWeight: "900",
        color: isCombo ? "#fbbf24" : color,
        textShadow: isCombo ? "0 0 10px #fbbf24" : `0 0 10px ${color}`,
      }}>
        +{popup.points}{isCombo ? ` 🔥 x${popup.combo} combo!` : ""}
      </div>
    </div>
  );
}

function Cell({ cell, onClick, exploding, correct, accentColor }) {
  let bg = "rgba(255,255,255,0.06)";
  let border = "1px solid rgba(255,255,255,0.08)";
  let content = null;
  let animation = "none";
  let cursor = "pointer";

  if (exploding) {
    bg = "rgba(239,68,68,0.3)"; border = "1px solid #ef4444";
    animation = "explode 0.9s ease forwards";
    content = <span style={{ fontSize: "22px" }}>💥</span>;
  } else if (correct) {
    bg = `${accentColor}33`; border = `1px solid ${accentColor}`;
    animation = "correctPop 0.8s ease forwards";
    content = <span style={{ fontSize: "20px", color: accentColor }}>✓</span>;
  } else if (cell.revealed && cell.isMine) {
    bg = "rgba(239,68,68,0.15)"; border = "1px solid rgba(239,68,68,0.3)";
    content = <span style={{ fontSize: "18px" }}>💣</span>;
    cursor = "default";
  } else if (cell.revealed) {
    bg = `${accentColor}1a`; border = `1px solid ${accentColor}4d`;
    content = <span style={{ fontSize: "18px", color: accentColor }}>✓</span>;
    cursor = "default";
  } else {
    content = <span style={{ fontSize: "18px", opacity: 0.4 }}>?</span>;
  }

  return (
    <div
      onClick={!cell.revealed ? onClick : undefined}
      style={{
        width: "clamp(44px, 9vw, 60px)", height: "clamp(44px, 9vw, 60px)",
        background: bg, border, borderRadius: "8px",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor, transition: "background 0.15s, border 0.15s", animation, userSelect: "none",
      }}
      onMouseEnter={e => { if (!cell.revealed) e.currentTarget.style.background = `${accentColor}1a`; }}
      onMouseLeave={e => { if (!cell.revealed) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
    >
      {content}
    </div>
  );
}

function AnswerButton({ label, onClick, shake, color }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "14px",
        background: hover ? `${color}22` : "rgba(255,255,255,0.06)",
        border: `2px solid ${hover ? color : color + "44"}`,
        borderRadius: "10px", color: "#fff",
        fontSize: "20px", fontWeight: "700",
        cursor: "pointer", fontFamily: "'Courier New', monospace",
        transform: hover ? "scale(1.04)" : "scale(1)",
        transition: "all 0.15s",
        animation: shake ? "shake 0.4s ease" : "none",
      }}
    >
      {label}
    </button>
  );
}

function HudItem({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(255,255,255,0.35)", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: "800", color }}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />;
}

function Modal({ children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200,
    }}>
      <div style={{
        background: "linear-gradient(135deg, #0f1f2e, #0a1520)",
        border: "1px solid rgba(74,222,128,0.25)",
        borderRadius: "20px", padding: "36px 32px",
        textAlign: "center", maxWidth: "380px", width: "90%",
        boxShadow: "0 0 60px rgba(0,0,0,0.8)",
        animation: "fadeIn 0.25s ease",
        fontFamily: "'Courier New', monospace", color: "#fff",
      }}>
        {children}
      </div>
    </div>
  );
}

const primaryBtn = (color) => ({
  padding: "12px 24px",
  background: color,
  border: "none", borderRadius: "10px",
  color: "#000", fontSize: "13px", fontWeight: "900",
  cursor: "pointer", letterSpacing: "2px",
  fontFamily: "'Courier New', monospace",
  boxShadow: `0 0 16px ${color}66`,
});

const secondaryBtn = {
  padding: "12px 24px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: "10px", color: "rgba(255,255,255,0.7)",
  fontSize: "13px", fontWeight: "700",
  cursor: "pointer", letterSpacing: "2px",
  fontFamily: "'Courier New', monospace",
};
