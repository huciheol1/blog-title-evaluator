import React, { useState, useEffect } from "react";

const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

const DAN24_PENALTIES = [
  { pattern: /(.)\1{3,}/, label: "동일 문자 반복 (어뷰징)", score: -20 },
  { pattern: /[!?]{2,}/, label: "과도한 특수문자", score: -15 },
  { pattern: /(클릭|눌러|바로가기|여기서|지금바로)/, label: "클릭 유도성 문구", score: -15 },
  { pattern: /(최저가|공짜|무료|꽁짜|대박|혜택|이벤트.*지금)/, label: "과도한 상업성 문구", score: -12 },
  { pattern: /[A-Za-z]{15,}/, label: "의미없는 영문 나열", score: -10 },
  { pattern: /(\d{1,3},){2,}/, label: "숫자 나열 패턴", score: -10 },
  { pattern: /(광고|AD|sponsored)/i, label: "광고성 표현", score: -20 },
  { pattern: /(.{2,})\1{2,}/, label: "구문 반복 패턴", score: -18 },
  { pattern: /[ㄱ-ㅎㅏ-ㅣ]{2,}/, label: "자모 단독 사용", score: -12 },
  { pattern: /\s{2,}/, label: "불필요한 공백", score: -8 },
];

const DAN25_CHECKS = [
  { test: t => t.length >= 15 && t.length <= 40, label: "적정 제목 길이 (15~40자)", score: 15, tip: "제목은 15~40자가 최적입니다" },
  { test: t => /[가-힣]/.test(t) && (t.match(/[가-힣]/g)||[]).length >= 5, label: "한글 키워드 충분", score: 12, tip: "한글 키워드를 풍부하게 활용하세요" },
  { test: t => /(방법|후기|추천|비교|정리|총정리|가이드|이유|꿀팁|노하우|완벽|필수)/.test(t), label: "정보성 키워드 포함", score: 15, tip: "방법·후기·추천 등 정보성 단어를 넣으세요" },
  { test: t => /\d/.test(t), label: "숫자 포함 (구체성)", score: 8, tip: "숫자를 넣으면 신뢰도가 올라갑니다" },
  { test: t => !/(^[^가-힣a-zA-Z\d]+$)/.test(t), label: "의미있는 내용 포함", score: 10, tip: "제목에 의미있는 내용을 담으세요" },
  { test: t => /(년|월|최신|신|new|NEW)/.test(t), label: "최신성 표현", score: 8, tip: "연도·최신 등으로 신선함을 표현하세요" },
  { test: t => t.split(/\s+/).length >= 3, label: "키워드 다양성", score: 10, tip: "2개 이상의 키워드 조합을 사용하세요" },
  { test: t => !/^[^가-힣a-zA-Z\d]*$/.test(t) && t.length > 8, label: "최소 정보량 충족", score: 10, tip: "제목에 충분한 정보를 담으세요" },
  { test: t => /(리뷰|사용기|체험|경험|직접|솔직)/.test(t), label: "실사용 경험 표현", score: 10, tip: "직접 경험을 강조하면 신뢰도 UP" },
  { test: t => t.length >= 10 && !/[!]{2,}/.test(t), label: "자연스러운 문체", score: 12, tip: "과도한 느낌표 없이 자연스럽게 쓰세요" },
];

function evaluateTitle(title) {
  let dan24Score = 100;
  let dan25Score = 0;
  const dan24Issues = [], dan25Passed = [], dan25Failed = [];
  const dan25Max = DAN25_CHECKS.reduce((a, c) => a + c.score, 0);

  DAN24_PENALTIES.forEach(p => {
    if (p.pattern.test(title)) { dan24Score += p.score; dan24Issues.push({ label: p.label, score: p.score }); }
  });
  dan24Score = Math.max(0, dan24Score);

  DAN25_CHECKS.forEach(c => {
    if (c.test(title)) { dan25Score += c.score; dan25Passed.push(c); }
    else dan25Failed.push(c);
  });

  const dan25Pct = Math.round((dan25Score / dan25Max) * 100);
  const total = Math.round(dan24Score * 0.45 + dan25Pct * 0.55);

  let grade, gradeColor, gradeLabel;
  if (total >= 85)      { grade="S"; gradeColor="#00b894"; gradeLabel="최적화 완료"; }
  else if (total >= 70) { grade="A"; gradeColor="#0984e3"; gradeLabel="노출 유리"; }
  else if (total >= 55) { grade="B"; gradeColor="#fdcb6e"; gradeLabel="개선 권장"; }
  else if (total >= 40) { grade="C"; gradeColor="#e17055"; gradeLabel="노출 불리"; }
  else                  { grade="D"; gradeColor="#d63031"; gradeLabel="저품질 위험"; }

  return { dan24Score, dan25Score, dan25Pct, dan24Issues, dan25Passed, dan25Failed, total, grade, gradeColor, gradeLabel };
}

export default function BlogTitleEvaluator() {
  const [title, setTitle] = useState("");
  const [result, setResult] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem("blog_history") || "[]"));
  const [tab, setTab] = useState("evaluate");
  const [learnTitle, setLearnTitle] = useState("");
  const [learnRating, setLearnRating] = useState("good");
  const [learnNote, setLearnNote] = useState("");
  const [learnData, setLearnData] = useState(() => JSON.parse(localStorage.getItem("blog_learn") || "[]"));
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(null);

  const handleEvaluate = async () => {
    if (!title.trim()) return;
    const r = evaluateTitle(title);
    setResult(r);
    setAiResult(null);

    const newHistory = [{ title, ...r, date: new Date().toLocaleDateString("ko") }, ...history].slice(0, 50);
    setHistory(newHistory);
    localStorage.setItem("blog_history", JSON.stringify(newHistory));

    if (!API_KEY) return;
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `당신은 네이버 블로그 SEO 전문가입니다. 단24(저품질 필터)와 단25(콘텐츠 품질) 알고리즘 기반으로 제목을 평가하고 개선안을 제시합니다. 반드시 JSON만 반환하세요 (마크다운 없이): {"improved":["제목1","제목2","제목3"],"keyword_tips":["팁1","팁2"],"one_line":"핵심 한 줄 요약"}`,
          messages: [{ role: "user", content: `제목: "${title}"\n단24: ${r.dan24Score}/100\n단25: ${r.dan25Pct}/100\n총점: ${r.total}/100\n문제: ${r.dan24Issues.map(i=>i.label).join(", ")||"없음"}\n미충족: ${r.dan25Failed.map(i=>i.label).join(", ")||"없음"}` }],
        }),
      });
      const data = await res.json();
      const text = (data.content||[]).map(b=>b.text||"").join("");
      const ai = JSON.parse(text.replace(/```json|```/g,"").trim());
      setAiResult(ai);
    } catch (e) {
      setAiResult({ error: true });
    }
    setAiLoading(false);
  };

  const saveLearn = () => {
    if (!learnTitle.trim()) return;
    const r = evaluateTitle(learnTitle);
    const entry = { id: Date.now(), title: learnTitle, rating: learnRating, note: learnNote, ...r, date: new Date().toLocaleDateString("ko") };
    const newData = [entry, ...learnData].slice(0, 200);
    setLearnData(newData);
    localStorage.setItem("blog_learn", JSON.stringify(newData));
    setLearnTitle(""); setLearnNote("");
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const copyTitle = (t) => {
    navigator.clipboard?.writeText(t);
    setCopied(t); setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={s.root}>
      <div style={s.bgNoise} />
      <div style={s.header}>
        <div style={s.headerBadge}>단24 · 단25 알고리즘 기반</div>
        <h1 style={s.headerTitle}>네이버 블로그 제목 평가기</h1>
        <p style={s.headerSub}>AI가 저품질 필터·콘텐츠 품질을 실시간 분석하고 학습합니다</p>
      </div>

      <div style={s.tabs}>
        {[["evaluate","🔍 제목 분석"],["learn","📚 학습 데이터"],["stats","📊 통계"]].map(([id,label]) => (
          <button key={id} style={{...s.tab, ...(tab===id?s.tabActive:{})}} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── 제목 분석 탭 ── */}
      {tab === "evaluate" && (
        <div style={s.content}>
          <div style={s.card}>
            <div style={s.inputLabel}>블로그 제목 입력</div>
            <div style={s.inputRow}>
              <input style={s.input} value={title} onChange={e=>setTitle(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleEvaluate()}
                placeholder="예) 2024 아이폰16 실사용 후기 - 한달 쓴 솔직한 리뷰" maxLength={60}/>
              <button style={s.evalBtn} onClick={handleEvaluate}>분석</button>
            </div>
            <div style={s.charCount}>{title.length}/60자 · 권장: 15~40자</div>
          </div>

          {result && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* 총점 */}
              <div style={{...s.card,...s.scoreCard}}>
                <div style={{textAlign:"center"}}>
                  <div style={{...s.grade,color:result.gradeColor,borderColor:result.gradeColor}}>{result.grade}</div>
                  <div style={s.gradeLabel}>{result.gradeLabel}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{marginBottom:10}}>
                    <span style={{fontSize:48,fontWeight:800,color:result.gradeColor}}>{result.total}</span>
                    <span style={{color:"#4a4a5a",fontSize:20}}>/100</span>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <div style={s.scorePill}><span style={s.pillLabel}>단24</span><span style={{fontWeight:700,color:result.dan24Score>=80?"#00b894":"#e17055"}}>{result.dan24Score}</span></div>
                    <div style={s.scorePill}><span style={s.pillLabel}>단25</span><span style={{fontWeight:700,color:result.dan25Pct>=60?"#0984e3":"#e17055"}}>{result.dan25Pct}</span></div>
                  </div>
                </div>
              </div>

              {/* 단24 */}
              <div style={s.card}>
                <div style={s.sectionHeader}>
                  <span style={{...s.sectionBadge,background:"#d63031"}}>단24</span>
                  <span style={s.sectionTitle}>저품질 필터 분석</span>
                  <span style={{color:result.dan24Score>=80?"#00b894":"#e17055",fontWeight:700,fontSize:13}}>{result.dan24Score}/100</span>
                </div>
                <div style={s.barTrack}><div style={{...s.barFill,width:result.dan24Score+"%",background:result.dan24Score>=80?"#00b894":"#e17055"}}/></div>
                {result.dan24Issues.length===0
                  ? <div style={s.passBox}>✅ 저품질 패턴 없음 — 필터 통과 가능성 높음</div>
                  : result.dan24Issues.map((issue,i) => (
                    <div key={i} style={s.issueRow}><span>⚠️</span><span style={s.issueLabel}>{issue.label}</span><span style={s.issueScore}>{issue.score}</span></div>
                  ))
                }
              </div>

              {/* 단25 */}
              <div style={s.card}>
                <div style={s.sectionHeader}>
                  <span style={{...s.sectionBadge,background:"#0984e3"}}>단25</span>
                  <span style={s.sectionTitle}>콘텐츠 품질 분석</span>
                  <span style={{color:"#0984e3",fontWeight:700,fontSize:13}}>{result.dan25Pct}/100</span>
                </div>
                <div style={s.barTrack}><div style={{...s.barFill,width:result.dan25Pct+"%",background:"#0984e3"}}/></div>
                <div style={s.checkGrid}>
                  {DAN25_CHECKS.map((c,i) => {
                    const passed = result.dan25Passed.some(p=>p.label===c.label);
                    return (
                      <div key={i} style={{...s.checkItem,opacity:passed?1:0.5}}>
                        <span style={{color:passed?"#00b894":"#b2bec3"}}>{passed?"✓":"✗"}</span>
                        <span style={s.checkLabel}>{c.label}</span>
                        <span style={{color:passed?"#00b894":"#636e72",fontSize:11}}>+{c.score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI */}
              <div style={s.card}>
                <div style={s.sectionHeader}>
                  <span style={{...s.sectionBadge,background:"#6c5ce7"}}>AI</span>
                  <span style={s.sectionTitle}>AI 개선 제안</span>
                </div>
                {aiLoading && <div style={s.aiLoading}><div style={s.spinner}/><span>Claude AI가 분석 중...</span></div>}
                {aiResult && !aiResult.error && (
                  <div>
                    <div style={s.oneLineTip}>💡 {aiResult.one_line}</div>
                    <div style={s.improvedLabel}>✨ 개선 제목 추천</div>
                    {aiResult.improved?.map((t,i) => (
                      <div key={i} style={s.improvedTitle}>
                        <span style={s.improvedNum}>{i+1}</span>
                        <span style={s.improvedText}>{t}</span>
                        <button style={s.copyBtn} onClick={()=>copyTitle(t)}>{copied===t?"✓ 복사됨":"복사"}</button>
                      </div>
                    ))}
                    {aiResult.keyword_tips?.length>0 && (
                      <div style={s.kwTips}>
                        <div style={s.kwLabel}>🔑 키워드 팁</div>
                        {aiResult.keyword_tips.map((t,i)=><div key={i} style={s.kwTip}>• {t}</div>)}
                      </div>
                    )}
                  </div>
                )}
                {!aiLoading && !aiResult && <div style={{color:"#4a4a5a",fontSize:12}}>분석 버튼을 누르면 AI가 개선 제목을 추천해드려요</div>}
              </div>

              {/* 개선 팁 */}
              {result.dan25Failed.length>0 && (
                <div style={s.card}>
                  <div style={s.sectionHeader}>
                    <span style={{...s.sectionBadge,background:"#fdcb6e",color:"#2d3436"}}>TIP</span>
                    <span style={s.sectionTitle}>개선 필요 항목</span>
                  </div>
                  {result.dan25Failed.map((c,i)=>(
                    <div key={i} style={s.tipRow}><span>💬</span><span style={s.tipText}>{c.tip}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 히스토리 */}
          {history.length>0 && (
            <div style={s.card}>
              <div style={{...s.sectionHeader}}>
                <span style={s.sectionTitle}>🕐 최근 분석 기록</span>
                <button style={s.clearBtn} onClick={()=>{setHistory([]);localStorage.removeItem("blog_history");}}>초기화</button>
              </div>
              {history.slice(0,8).map((h,i)=>(
                <div key={i} style={s.historyRow} onClick={()=>setTitle(h.title)}>
                  <span style={s.histTitle}>{h.title}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,marginLeft:10}}>
                    <span style={{fontWeight:700,color:h.gradeColor}}>{h.grade}</span>
                    <span style={{color:"#636e72",fontSize:12}}>{h.total}점</span>
                    <span style={{color:"#4a4a5a",fontSize:11}}>{h.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 학습 데이터 탭 ── */}
      {tab === "learn" && (
        <div style={s.content}>
          <div style={s.card}>
            <div style={{...s.sectionTitle,marginBottom:16,fontSize:15}}>📥 학습 데이터 추가</div>
            <div style={s.inputLabel}>제목</div>
            <input style={{...s.input,marginBottom:12}} value={learnTitle} onChange={e=>setLearnTitle(e.target.value)} placeholder="학습시킬 블로그 제목 입력"/>
            <div style={s.inputLabel}>평가</div>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {[["good","👍 좋은 제목","#00b894"],["bad","👎 나쁜 제목","#d63031"],["neutral","😐 보통","#636e72"]].map(([v,label,color])=>(
                <button key={v} style={{...s.ratingBtn,borderColor:learnRating===v?color:"#2d2d44",color:learnRating===v?color:"#636e72",background:learnRating===v?color+"18":"transparent"}}
                  onClick={()=>setLearnRating(v)}>{label}</button>
              ))}
            </div>
            <div style={s.inputLabel}>메모 (선택)</div>
            <input style={{...s.input,marginBottom:16}} value={learnNote} onChange={e=>setLearnNote(e.target.value)} placeholder="왜 좋은/나쁜 제목인지 메모"/>
            <button style={s.saveBtn} onClick={saveLearn}>{saved?"✅ 저장됨!":"💾 학습 데이터 저장"}</button>
          </div>
          {learnData.length>0 && (
            <div style={s.card}>
              <div style={{...s.sectionHeader}}>
                <span style={s.sectionTitle}>📋 학습 데이터 목록 ({learnData.length}개)</span>
                <button style={s.clearBtn} onClick={()=>{setLearnData([]);localStorage.removeItem("blog_learn");}}>전체삭제</button>
              </div>
              {learnData.map((d,i)=>(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #1a1a2e"}}>
                  <span style={{fontSize:18}}>{d.rating==="good"?"👍":d.rating==="bad"?"👎":"😐"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"#c0c0d8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.title}</div>
                    <div style={{fontSize:11,marginTop:3,color:"#636e72"}}><span style={{color:d.gradeColor}}>{d.grade}등급 {d.total}점</span>{d.note?` · ${d.note}`:""} · {d.date}</div>
                  </div>
                  <button style={{background:"transparent",border:"none",color:"#4a4a5a",cursor:"pointer",fontSize:14,padding:"4px 6px"}}
                    onClick={()=>{const n=[...learnData];n.splice(i,1);setLearnData(n);localStorage.setItem("blog_learn",JSON.stringify(n));}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 통계 탭 ── */}
      {tab === "stats" && (
        <div style={s.content}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {label:"총 학습 데이터",val:learnData.length+"개",color:"#6c5ce7"},
              {label:"좋은 제목",val:learnData.filter(d=>d.rating==="good").length+"개",color:"#00b894"},
              {label:"나쁜 제목",val:learnData.filter(d=>d.rating==="bad").length+"개",color:"#d63031"},
              {label:"평균 점수",val:(learnData.length?Math.round(learnData.reduce((a,d)=>a+d.total,0)/learnData.length):0)+"점",color:"#0984e3"},
            ].map((s2,i)=>(
              <div key={i} style={{background:"#13132a",border:`1px solid ${s2.color}`,borderRadius:12,padding:18,textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:800,color:s2.color}}>{s2.val}</div>
                <div style={{color:"#636e72",fontSize:12,marginTop:4}}>{s2.label}</div>
              </div>
            ))}
          </div>
          {history.length>0 && (
            <div style={s.card}>
              <div style={{...s.sectionTitle,marginBottom:12}}>📈 점수 분포</div>
              {[["S(85+)",85,101],["A(70+)",70,85],["B(55+)",55,70],["C(40+)",40,55],["D(0+)",0,40]].map(([label,min,max],i)=>{
                const colors=["#00b894","#0984e3","#fdcb6e","#e17055","#d63031"];
                const cnt=history.filter(h=>h.total>=min&&h.total<max).length;
                const pct=history.length?Math.round(cnt/history.length*100):0;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div style={{color:"#636e72",fontSize:11,width:56,textAlign:"right"}}>{label}</div>
                    <div style={{flex:1,height:8,background:"#0f0f1a",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:colors[i],borderRadius:4}}/>
                    </div>
                    <div style={{color:"#636e72",fontSize:11,width:28,textAlign:"right"}}>{cnt}개</div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={s.card}>
            <div style={{...s.sectionTitle,marginBottom:12}}>📖 단24 · 단25 알고리즘 안내</div>
            <div style={{background:"#0f0f1a",border:"1px solid #2d2d44",borderRadius:8,padding:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"#d63031",marginBottom:6}}>단24 — 저품질 필터</div>
              <p style={{color:"#636e72",fontSize:12,lineHeight:1.8,margin:0}}>네이버가 스팸·어뷰징성 콘텐츠를 걸러내는 필터입니다.</p>
              <div style={{fontSize:13,fontWeight:700,color:"#0984e3",marginTop:14,marginBottom:6}}>단25 — 콘텐츠 품질</div>
              <p style={{color:"#636e72",fontSize:12,lineHeight:1.8,margin:0}}>제목의 정보성과 신뢰도를 평가합니다. 점수가 높을수록 VIEW탭 상위 노출에 유리합니다.</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        input::placeholder { color: #4a4a5a; }
        input:focus { outline: none; border-color: #6c5ce7 !important; box-shadow: 0 0 0 3px rgba(108,92,231,0.15); }
        button:hover { filter: brightness(1.1); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #1a1a2e; } ::-webkit-scrollbar-thumb { background: #2d2d44; border-radius: 2px; }
      `}</style>
    </div>
  );
}

const s = {
  root: { minHeight:"100vh", background:"#0f0f1a", color:"#e0e0f0", fontFamily:"'Pretendard',system-ui,sans-serif", paddingBottom:60 },
  bgNoise: { position:"fixed", inset:0, backgroundImage:"radial-gradient(ellipse at 30% 20%, #1a1a3e44 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, #1a0a2e33 0%, transparent 50%)", pointerEvents:"none" },
  header: { textAlign:"center", padding:"40px 20px 24px", background:"linear-gradient(180deg, #13132a 0%, transparent 100%)" },
  headerBadge: { display:"inline-block", background:"#6c5ce720", border:"1px solid #6c5ce740", color:"#a29bfe", fontSize:11, padding:"4px 14px", borderRadius:20, marginBottom:14, letterSpacing:"0.15em" },
  headerTitle: { fontSize:"clamp(22px,5vw,32px)", fontWeight:800, margin:"0 0 10px", background:"linear-gradient(135deg,#e0e0f0,#a29bfe)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1.3 },
  headerSub: { color:"#636e72", fontSize:13, margin:0 },
  tabs: { display:"flex", justifyContent:"center", gap:4, padding:"0 20px 20px", maxWidth:640, margin:"0 auto" },
  tab: { flex:1, background:"transparent", border:"1px solid #2d2d44", color:"#636e72", borderRadius:8, padding:"10px 8px", fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" },
  tabActive: { background:"#6c5ce720", borderColor:"#6c5ce7", color:"#a29bfe", fontWeight:600 },
  content: { maxWidth:620, margin:"0 auto", padding:"0 16px", display:"flex", flexDirection:"column", gap:12, animation:"slideIn 0.4s ease" },
  card: { background:"#13132a", border:"1px solid #2d2d44", borderRadius:12, padding:18 },
  inputLabel: { color:"#636e72", fontSize:11, letterSpacing:"0.1em", marginBottom:8, textTransform:"uppercase" },
  inputRow: { display:"flex", gap:8, marginBottom:6 },
  input: { flex:1, background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, color:"#e0e0f0", padding:"12px 14px", fontSize:14, fontFamily:"inherit", width:"100%" },
  evalBtn: { background:"linear-gradient(135deg,#6c5ce7,#a29bfe)", color:"#fff", border:"none", borderRadius:8, padding:"12px 20px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  charCount: { color:"#4a4a5a", fontSize:11, textAlign:"right" },
  scoreCard: { display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" },
  grade: { fontSize:48, fontWeight:900, border:"3px solid", borderRadius:12, width:72, height:72, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 6px" },
  gradeLabel: { fontSize:11, color:"#888", letterSpacing:"0.1em" },
  scorePill: { background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:20, padding:"5px 12px", display:"flex", gap:8, alignItems:"center", fontSize:12 },
  pillLabel: { color:"#636e72" },
  sectionHeader: { display:"flex", alignItems:"center", gap:10, marginBottom:12 },
  sectionBadge: { color:"#fff", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:4 },
  sectionTitle: { flex:1, fontSize:14, fontWeight:600, color:"#c0c0d8" },
  barTrack: { height:6, background:"#0f0f1a", borderRadius:3, marginBottom:12, overflow:"hidden" },
  barFill: { height:"100%", borderRadius:3, transition:"width 0.8s ease" },
  passBox: { background:"#00b89415", border:"1px solid #00b89430", borderRadius:6, padding:"10px 14px", color:"#00b894", fontSize:13 },
  issueRow: { display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid #1a1a2e" },
  issueLabel: { flex:1, fontSize:13, color:"#e17055" },
  issueScore: { color:"#d63031", fontSize:12, fontWeight:700 },
  checkGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 },
  checkItem: { display:"flex", alignItems:"center", gap:6, fontSize:12, padding:"4px 0" },
  checkLabel: { flex:1, color:"#a0a0b8" },
  aiLoading: { display:"flex", alignItems:"center", gap:12, color:"#a29bfe", padding:"16px 0" },
  spinner: { width:20, height:20, border:"2px solid #2d2d44", borderTop:"2px solid #a29bfe", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  oneLineTip: { background:"#6c5ce715", border:"1px solid #6c5ce730", borderRadius:8, padding:"10px 14px", color:"#a29bfe", fontSize:13, marginBottom:14, lineHeight:1.6 },
  improvedLabel: { color:"#636e72", fontSize:11, letterSpacing:"0.1em", marginBottom:8, textTransform:"uppercase" },
  improvedTitle: { display:"flex", alignItems:"center", gap:10, background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, padding:"10px 12px", marginBottom:8 },
  improvedNum: { color:"#6c5ce7", fontWeight:700, fontSize:13, minWidth:16 },
  improvedText: { flex:1, fontSize:13, color:"#e0e0f0", lineHeight:1.5 },
  copyBtn: { background:"#6c5ce720", border:"1px solid #6c5ce740", color:"#a29bfe", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  kwTips: { background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, padding:"12px 14px", marginTop:8 },
  kwLabel: { color:"#fdcb6e", fontSize:11, marginBottom:8 },
  kwTip: { color:"#a0a0b8", fontSize:12, lineHeight:1.8 },
  tipRow: { display:"flex", gap:8, padding:"6px 0", borderBottom:"1px solid #1a1a2e" },
  tipText: { flex:1, fontSize:13, color:"#a0a0b8", lineHeight:1.5 },
  historyRow: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #1a1a2e", cursor:"pointer" },
  histTitle: { fontSize:13, color:"#c0c0d8", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  clearBtn: { background:"transparent", border:"1px solid #2d2d44", color:"#636e72", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit" },
  ratingBtn: { flex:1, background:"transparent", border:"1px solid", borderRadius:8, padding:"10px 8px", fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s", minWidth:90 },
  saveBtn: { display:"block", width:"100%", background:"linear-gradient(135deg,#6c5ce7,#a29bfe)", color:"#fff", border:"none", borderRadius:8, padding:13, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
};
