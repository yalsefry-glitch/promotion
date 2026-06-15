// ============================================================================
//  ProMotion — الخادم الكامل (backend)
//  يدمج: محرّك البرومبت (Gemini Flash-Lite) + توليد الفيديو (fal.ai)
//  مصمّم للنشر على Render (الطبقة المجانية).
//
//  ⚠️ التحقق: البنية مبنية على توثيق Gemini و fal.ai الحالي، لكن لم أتمكن من
//     تشغيلها في بيئتي (تحتاج مفتاحين + شبكة + رصيد fal). اختبرها بمفاتيحك.
//     صياغة الكود (بنية الطلبات، معالجة الأخطاء، تحليل JSON) مراجَعة يدوياً.
//
//  المفاتيح (متغيّرات بيئة على Render — لا توضع في الكود أبداً):
//     GEMINI_API_KEY   مفتاح Google Gemini
//     FAL_KEY          مفتاح fal.ai
//
//  لماذا submit/poll؟ توليد الفيديو ياخذ 1-2 دقيقة، وطلب HTTP واحد طويل
//  قد ينقطع على الطبقة المجانية. لذا: /api/generate يبدأ الطلب ويرجّع
//  request_id فوراً، و /api/status يتابع حتى يجهز الفيديو.
// ============================================================================

import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { fal } from "@fal-ai/client";


// --- فحص المفاتيح -----------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GEMINI_API_KEY) {
  console.error("خطأ: GEMINI_API_KEY غير موجود في متغيّرات البيئة.");
  process.exit(1);
}
if (!FAL_KEY) {
  console.error("خطأ: FAL_KEY غير موجود في متغيّرات البيئة.");
  process.exit(1);
}

// تهيئة العملاء
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
fal.config({ credentials: FAL_KEY });

const GEMINI_MODEL = "gemini-2.5-flash-lite";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>ProMotion — استوديو الإعلانات</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root{
      --gold:#C9A66B; --gold-soft:#E0C896; --ink:#0E0F12;
      --panel:#16181D; --panel2:#1E2128; --line:#2A2E37;
      --text:#ECE8E1; --mute:#8B8F99;
    }
    *{box-sizing:border-box;}
    html,body{margin:0;padding:0;}
    body{
      background:radial-gradient(1200px 600px at 80% -10%, #1A1C22 0%, var(--ink) 55%);
      color:var(--text); font-family:'Tajawal','Segoe UI',system-ui,sans-serif;
      min-height:100vh;
    }
    .wrap{max-width:1280px;margin:0 auto;padding:0 clamp(16px,4vw,48px) 60px;}
    header{
      display:flex;align-items:center;justify-content:space-between;
      padding:20px clamp(16px,4vw,48px);border-bottom:1px solid var(--line);
      position:sticky;top:0;background:rgba(14,15,18,.85);backdrop-filter:blur(10px);z-index:10;
    }
    .brand{display:flex;align-items:center;gap:14px;}
    .brand-mark{font-size:26px;color:var(--gold);filter:drop-shadow(0 0 10px rgba(201,166,107,.35));}
    .brand h1{margin:0;font-size:22px;font-weight:800;}
    .brand p{margin:2px 0 0;font-size:13px;color:var(--mute);}
    .layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:22px;margin-top:26px;}
    .col{display:flex;flex-direction:column;gap:22px;min-width:0;}
    .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px 22px;}
    .card h2{margin:0 0 16px;font-size:16px;font-weight:700;display:flex;align-items:center;gap:10px;}
    .tpl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;}
    .tpl{display:flex;flex-direction:column;align-items:center;gap:8px;background:var(--panel2);
      border:1px solid var(--line);border-radius:14px;padding:14px 8px;color:var(--text);
      font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s;}
    .tpl:hover{border-color:rgba(201,166,107,.4);transform:translateY(-2px);}
    .tpl.active{border-color:var(--gold);background:rgba(201,166,107,.08);}
    .tpl .i{font-size:22px;}
    .field-label{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mute);margin-bottom:8px;font-weight:600;}
    .chip{font-size:11px;color:var(--ink);background:var(--gold-soft);border-radius:999px;padding:2px 10px;font-weight:700;}
    .warn-chip{font-size:11px;color:#F0C674;background:rgba(240,198,116,.09);border:1px solid rgba(240,198,116,.25);border-radius:999px;padding:2px 10px;}
    .script{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:stretch;}
    .script .arrow{align-self:center;color:var(--gold);font-size:22px;opacity:.7;}
    .side{display:flex;flex-direction:column;min-width:0;}
    textarea.prompt{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:12px;
      padding:14px;color:var(--text);font:inherit;font-size:14px;line-height:1.7;resize:vertical;}
    textarea.prompt:focus{outline:none;border-color:var(--gold);}
    .english{flex:1;background:var(--ink);border:1px solid var(--line);border-radius:12px;padding:14px;
      font-size:13px;line-height:1.7;color:var(--gold-soft);direction:ltr;text-align:left;
      min-height:110px;overflow-wrap:break-word;white-space:pre-wrap;}
    .english.empty{color:var(--mute);font-style:italic;}
    .english.loading{color:var(--mute);}
    .engine{display:flex;flex-direction:column;text-align:right;background:var(--panel2);
      border:1px solid var(--line);border-radius:14px;padding:14px 16px;cursor:pointer;font:inherit;
      color:var(--text);transition:all .18s;width:100%;margin-bottom:10px;}
    .engine:hover{border-color:rgba(201,166,107,.4);}
    .engine.active{border-color:var(--gold);background:rgba(201,166,107,.06);}
    .engine .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
    .engine .name{font-size:15px;font-weight:700;}
    .engine .badge{font-size:11px;color:var(--gold-soft);border:1px solid rgba(201,166,107,.27);border-radius:999px;padding:2px 10px;}
    .engine .tag{font-size:12px;color:var(--mute);line-height:1.5;}
    .engine .price{font-size:12px;color:var(--gold-soft);margin-top:6px;font-weight:600;}
    .pill-row{display:flex;gap:10px;flex-wrap:wrap;}
    .pill{display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--panel2);
      border:1px solid var(--line);border-radius:12px;padding:10px 16px;cursor:pointer;font:inherit;
      color:var(--text);font-size:14px;transition:all .18s;flex:1;min-width:90px;}
    .pill.sm{min-width:56px;flex:0 0 auto;padding:10px 14px;}
    .pill:hover{border-color:rgba(201,166,107,.4);}
    .pill.active{border-color:var(--gold);background:rgba(201,166,107,.08);color:var(--gold-soft);}
    .pill .hint{font-size:11px;color:var(--mute);margin-top:3px;}
    .toggle-row{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;}
    .toggle{display:flex;align-items:center;gap:9px;background:var(--panel2);border:1px solid var(--line);
      border-radius:999px;padding:9px 16px;cursor:pointer;font:inherit;color:var(--mute);font-size:13px;font-weight:600;transition:all .18s;}
    .toggle:disabled{opacity:.4;cursor:not-allowed;}
    .toggle .dot{width:9px;height:9px;border-radius:50%;background:var(--mute);transition:all .18s;}
    .toggle.on{color:var(--gold-soft);border-color:rgba(201,166,107,.4);background:rgba(201,166,107,.07);}
    .toggle.on .dot{background:var(--gold);box-shadow:0 0 8px var(--gold);}
    .preview{width:100%;background:var(--ink);border:1px solid var(--line);border-radius:14px;
      display:flex;align-items:center;justify-content:center;overflow:hidden;max-height:460px;margin:0 auto;}
    .preview video{width:100%;height:100%;object-fit:contain;}
    .empty-state{text-align:center;color:var(--mute);display:flex;flex-direction:column;gap:10px;align-items:center;padding:40px 20px;}
    .busy{text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;width:70%;padding:30px 0;}
    .ring{width:46px;height:46px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--gold);animation:spin .8s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .bar{width:100%;height:6px;background:var(--line);border-radius:999px;overflow:hidden;}
    .bar-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold-soft));border-radius:999px;transition:width .4s;}
    .cost{margin-top:16px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .cost .row{display:flex;justify-content:space-between;align-items:center;font-size:14px;}
    .cost .val{font-size:22px;color:var(--gold);font-weight:800;}
    .cost .meta{font-size:12px;color:var(--mute);margin-top:6px;}
    .btn{width:100%;margin-top:16px;background:linear-gradient(90deg,var(--gold),var(--gold-soft));
      color:var(--ink);border:none;border-radius:12px;padding:14px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;transition:all .18s;}
    .btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.05);}
    .btn:disabled{opacity:.4;cursor:not-allowed;}
    .btn-ghost{flex:1;background:transparent;color:var(--text);border:1px solid var(--line);border-radius:12px;
      padding:14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;}
    .btn-ghost:hover{border-color:rgba(201,166,107,.4);}
    .done-actions{display:flex;gap:10px;margin-top:16px;}
    .err{margin-top:14px;background:rgba(220,90,90,.08);border:1px solid rgba(220,90,90,.3);
      border-radius:12px;padding:12px 14px;font-size:13px;color:#E89090;line-height:1.6;direction:ltr;text-align:left;}
    .note{background:rgba(201,166,107,.05);border:1px solid rgba(201,166,107,.2);border-radius:14px;padding:16px 18px;}
    .note b{font-size:13px;color:var(--gold-soft);display:block;margin-bottom:6px;}
    .note p{margin:0;font-size:12.5px;color:#C7C2B8;line-height:1.7;}
    @media(max-width:900px){
      .layout{grid-template-columns:1fr;}
      .script{grid-template-columns:1fr;}
      .script .arrow{transform:rotate(90deg);}
      .preview{max-height:340px;}
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

  <script type="text/babel">
    const { useState, useRef, useEffect, useCallback } = React;

    const ENGINES = [
      { id:"veo-3.1", name:"Veo 3.1", tagline:"الأقوى للإعلانات الواقعية · 4K · صوت مدمج", pricePerSec:0.15, durations:[4,6,8], aspects:["9:16","16:9"], badge:"موصى به" },
      { id:"kling-3.0", name:"Kling 3.0", tagline:"أفضل قيمة · ثبات الشخصية · نطق متعدد اللغات", pricePerSec:0.10, durations:[5,10], aspects:["9:16","1:1","16:9"], badge:"اقتصادي" },
      { id:"wan-2.6", name:"Wan 2.6", tagline:"مسوّدات سريعة · 1080p · الأرخص", pricePerSec:0.05, durations:[5], aspects:["9:16","1:1","16:9"], badge:"مسوّدة" },
    ];
    const ASPECTS = [
      { id:"9:16", label:"عمودي", hint:"ستوري · ريلز · تيك توك" },
      { id:"1:1", label:"مربع", hint:"منشور إنستغرام" },
      { id:"16:9", label:"أفقي", hint:"يوتيوب · شاشات" },
    ];
    const TEMPLATES = [
      { id:"product", title:"منتج", icon:"📦", seed:"ابغى إعلان لمنتج فخم، لقطة قريبة والمنتج يدور ببطء على سطح عاكس، إضاءة استوديو ناعمة وخلفية متدرّجة" },
      { id:"food", title:"طعام", icon:"🍽️", seed:"إعلان لطبق شهي يطلع منه بخار، قطرات ماء على المكونات الطازجة، إضاءة دافئة والكاميرا تمر فوق الطعام ببطء" },
      { id:"realestate", title:"عقار", icon:"🏠", seed:"جولة داخل شقة عصرية فخمة، ضوء نهار طبيعي من نوافذ كبيرة، الكاميرا تنزلق وتكشف المساحات الواسعة" },
      { id:"service", title:"خدمة", icon:"🛠️", seed:"إعلان احترافي يوضّح خدمة، ناس يتعاملون بثقة في بيئة عمل أنيقة، إضاءة طبيعية وإيقاع يوحي بالكفاءة" },
      { id:"brand", title:"هوية علامة", icon:"✨", seed:"افتتاحية علامة تجارية، عناصر متوهجة تتجمّع وتشكّل شعار، خلفية داكنة فخمة وحركة بطيئة درامية بتوهج ذهبي" },
    ];

    const API = ""; // نفس الأصل — الخادم يخدم الواجهة

    function App(){
      const [arabic,setArabic]=useState("");
      const [engineId,setEngineId]=useState(ENGINES[0].id);
      const [aspect,setAspect]=useState(ASPECTS[0].id);
      const [duration,setDuration]=useState(8);
      const [audio,setAudio]=useState(true);
      const [status,setStatus]=useState("idle"); // idle|generating|done|error
      const [progress,setProgress]=useState(0);
      const [videoUrl,setVideoUrl]=useState(null);
      const [errMsg,setErrMsg]=useState("");
      const [english,setEnglish]=useState("");
      const [engLoading,setEngLoading]=useState(false);
      const [activeTpl,setActiveTpl]=useState(null);
      const pollRef=useRef(null);
      const debRef=useRef(null);

      const engine=ENGINES.find(e=>e.id===engineId)||ENGINES[0];
      const audioMul=audio?1.0:0.6;
      const estCost=(duration*engine.pricePerSec*audioMul).toFixed(2);

      // عند تبديل المحرك: لو المدة أو الأبعاد غير مدعومة، اضبطها على أول قيمة مسموحة
      useEffect(()=>{
        if(!engine.durations.includes(duration)) setDuration(engine.durations[0]);
        if(!engine.aspects.includes(aspect)) setAspect(engine.aspects[0]);
      },[engineId]);

      // تحسين البرومبت تلقائياً بعد توقّف الكتابة (debounce)
      useEffect(()=>{
        if(debRef.current) clearTimeout(debRef.current);
        if(!arabic.trim()){ setEnglish(""); return; }
        debRef.current=setTimeout(async()=>{
          setEngLoading(true);
          try{
            const r=await fetch(API+"/api/build-prompt",{
              method:"POST",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({arabic,aspect,engine:engine.name})
            });
            const d=await r.json();
            if(r.ok && d.prompt) setEnglish(d.prompt);
            else setEnglish("");
          }catch(e){ setEnglish(""); }
          finally{ setEngLoading(false); }
        },700);
        return ()=>{ if(debRef.current) clearTimeout(debRef.current); };
      },[arabic,aspect,engineId]);

      useEffect(()=>()=>{ if(pollRef.current) clearInterval(pollRef.current); },[]);

      function applyTpl(t){ setActiveTpl(t.id); setArabic(t.seed); }

      async function generate(){
        if(!arabic.trim()||status==="generating") return;
        setStatus("generating"); setProgress(5); setErrMsg(""); setVideoUrl(null);
        try{
          const r=await fetch(API+"/api/generate",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({arabic,engineId,aspect,audio,duration,englishPrompt:english})
          });
          const d=await r.json();
          if(!r.ok) throw new Error(d.detail||d.error||"تعذّر بدء التوليد");

          // متابعة الحالة
          const ep=d.endpoint, rid=d.request_id;
          let p=5;
          pollRef.current=setInterval(async()=>{
            p=Math.min(92,p+3); setProgress(p);
            try{
              const sr=await fetch(API+"/api/status?request_id="+encodeURIComponent(rid)+"&endpoint="+encodeURIComponent(ep));
              const sd=await sr.json();
              if(sd.done && sd.videoUrl){
                clearInterval(pollRef.current); pollRef.current=null;
                setProgress(100); setVideoUrl(sd.videoUrl); setStatus("done");
              }else if(sd.error){
                clearInterval(pollRef.current); pollRef.current=null;
                setErrMsg(sd.detail||sd.error); setStatus("error");
              }
            }catch(e){ /* تجاهل خطأ متابعة عابر؛ يحاول مرة ثانية */ }
          },4000);
        }catch(e){
          setErrMsg(e.message||String(e)); setStatus("error");
        }
      }

      function reset(){ setStatus("idle"); setProgress(0); setVideoUrl(null); setErrMsg(""); }

      const aspStyle=(()=>{
        const a=aspect.split(":"); return {aspectRatio:a[0]+" / "+a[1]};
      })();

      return (
        <div className="wrap">
          <header>
            <div className="brand">
              <span className="brand-mark">◆</span>
              <div><h1>ProMotion</h1><p>توليد فيديوهات إعلانية بالذكاء الاصطناعي</p></div>
            </div>
          </header>

          <div className="layout">
            {/* التحكم */}
            <div className="col">
              <div className="card">
                <h2>ابدأ من قالب</h2>
                <div className="tpl-grid">
                  {TEMPLATES.map(t=>(
                    <button key={t.id} className={"tpl"+(activeTpl===t.id?" active":"")} onClick={()=>applyTpl(t)}>
                      <span className="i">{t.icon}</span><span>{t.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <h2>وصف الإعلان</h2>
                <div className="script">
                  <div className="side">
                    <label className="field-label">
                      اكتب بالعربي — بأي لهجة
                    </label>
                    <textarea className="prompt" rows={6} value={arabic}
                      onChange={e=>setArabic(e.target.value)}
                      placeholder="مثال: ابغى إعلان لعطر فخم، اللقطة قريبة والقارورة تلمع بإضاءة ذهبية…" />
                  </div>
                  <div className="arrow">←</div>
                  <div className="side">
                    <label className="field-label">البرومبت المُحسّن (إنجليزي)</label>
                    <div className={"english"+(english?"":(engLoading?" loading":" empty"))}>
                      {english || (engLoading?"…جارٍ التحسين":"سيظهر البرومبت السينمائي المترجم هنا")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h2>الإعدادات</h2>
                <label className="field-label">المحرك</label>
                {ENGINES.map(e=>(
                  <button key={e.id} className={"engine"+(engineId===e.id?" active":"")} onClick={()=>setEngineId(e.id)}>
                    <div className="top"><span className="name">{e.name}</span><span className="badge">{e.badge}</span></div>
                    <span className="tag">{e.tagline}</span>
                    <span className="price">{e.pricePerSec.toFixed(2)}$ / ثانية</span>
                  </button>
                ))}

                <label className="field-label" style={{marginTop:18}}>الأبعاد</label>
                <div className="pill-row">
                  {ASPECTS.filter(a=>engine.aspects.includes(a.id)).map(a=>(
                    <button key={a.id} className={"pill"+(aspect===a.id?" active":"")} onClick={()=>setAspect(a.id)}>
                      <strong>{a.label}</strong><span className="hint">{a.hint}</span>
                    </button>
                  ))}
                </div>

                <label className="field-label" style={{marginTop:18}}>
                  المدة — {duration} ثانية
                  <span className="warn-chip">حد {engine.name}</span>
                </label>
                <div className="pill-row">
                  {engine.durations.map(d=>(
                    <button key={d} className={"pill sm"+(duration===d?" active":"")} onClick={()=>setDuration(d)}>{d}ث</button>
                  ))}
                </div>

                <div className="toggle-row">
                  <button className={"toggle"+(audio?" on":"")} onClick={()=>setAudio(v=>!v)}>
                    <span className="dot"></span>صوت مدمج {audio?"(مُفعّل)":"(موفّر ~40%)"}
                  </button>
                </div>
              </div>
            </div>

            {/* المعاينة والسجل */}
            <div className="col">
              <div className="card">
                <h2>المعاينة</h2>
                <div className="preview" style={aspStyle}>
                  {status==="idle" && (
                    <div className="empty-state"><span style={{fontSize:40,opacity:.5}}>🎬</span><p>اكتب وصف الإعلان ثم اضغط توليد</p></div>
                  )}
                  {status==="generating" && (
                    <div className="busy">
                      <div className="ring"></div><p>جارٍ التوليد… {progress}%</p>
                      <div className="bar"><div className="bar-fill" style={{width:progress+"%"}}></div></div>
                      <p style={{fontSize:11,color:"var(--mute)"}}>التوليد ياخذ دقيقة إلى دقيقتين</p>
                    </div>
                  )}
                  {status==="done" && videoUrl && (
                    <video src={videoUrl} controls autoPlay loop></video>
                  )}
                  {status==="error" && (
                    <div className="empty-state"><span style={{fontSize:40}}>⚠️</span><p>تعذّر التوليد</p></div>
                  )}
                </div>

                {status==="error" && errMsg && <div className="err">{errMsg}</div>}

                <div className="cost">
                  <div className="row"><span>التكلفة التقديرية</span><strong className="val">{estCost}$</strong></div>
                  <div className="meta">{engine.name} · {duration}ث · {aspect} · {audio?"بصوت":"بدون صوت"}</div>
                </div>

                {status!=="done" ? (
                  <button className="btn" onClick={generate} disabled={!arabic.trim()||status==="generating"}>
                    {status==="generating"?"جارٍ التوليد…":"توليد الفيديو"}
                  </button>
                ) : (
                  <div className="done-actions">
                    <a className="btn" href={videoUrl} download style={{textDecoration:"none",textAlign:"center",display:"block"}}>تحميل الفيديو</a>
                    <button className="btn-ghost" onClick={reset}>توليد جديد</button>
                  </div>
                )}
              </div>

              <div className="note">
                <b>ملاحظة عن النطق العربي</b>
                <p>مزامنة الشفاه العربية لا تزال أضعف من الإنجليزية في كل المحركات. للإعلانات التي فيها كلام عربي، الأفضل توليد الفيديو بدون صوت وتركيب التعليق الصوتي في مرحلة منفصلة.</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
  </script>
</body>
</html>
`;

// خرائط المحركات إلى نقاط fal النهائية
const FAL_ENDPOINTS = {
  "veo-3.1": "fal-ai/veo3",
  "veo-3.1-fast": "fal-ai/veo3/fast",
  "kling-3.0": "fal-ai/kling-video/v2/master/text-to-video",
  "wan-2.6": "fal-ai/wan-t2v",
};

// ----------------------------------------------------------------------------
//  قلب المحرّك: تعليمات النظام (مفتوحة الطول — بلا حدود أسلوبية صارمة)
//  استثناءان فقط: لا شخصيات حقيقية مسمّاة، لا محتوى محمي/جنسي.
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert advertising film director and prompt engineer. Take a product/ad description written in Arabic (ANY dialect — Saudi, Egyptian, Gulf, Levantine, Maghrebi, or MSA) and produce a vivid, detailed English video-generation prompt for cinematic advertising.

UNDERSTAND THE INPUT:
- The user writes casually, often in dialect. Capture the INTENT, not literal words.
- Recognize dialect vocabulary (e.g. Saudi ابغى/ابي = want, وش = what; Egyptian عايز = want, ازاي = how; Gulf شلون = how, وايد = a lot; Levantine بدي = want).
- If something is vague, fill it with tasteful, professional advertising choices. Never ask questions. Never leave placeholders.

PRODUCE a rich English prompt covering, woven naturally:
- SUBJECT: the product/scene, concrete and attractive.
- SHOT & CAMERA: shot size and camera movement fitting the product.
- LIGHTING: specific and commercial-grade.
- MOOD & STYLE: the emotional tone and visual style.
- TECHNICAL cues: cinematic, high detail, commercial grade, color graded, sharp.
- Describe the framing naturally based on the target aspect ratio provided.
- You may write as much detail as the scene needs — complex, multi-element scenes are welcome.

OUTPUT:
- Output ONLY the English prompt itself. No preamble, no labels, no markdown, no surrounding quotes.

HARD CONSTRAINTS (non-negotiable):
- Never depict real, named public figures.
- Never depict copyrighted characters or trademarked logos unless the user explicitly names their own brand.
- No sexual or adult content.`;

// ----------------------------------------------------------------------------
//  الخطوة 1 — تحويل العربي إلى برومبت إنجليزي
// ----------------------------------------------------------------------------
async function buildPrompt({ arabic, aspect = "9:16", engine = "Veo 3.1" }) {
  const framing =
    aspect === "9:16"
      ? "vertical framing for mobile/reels"
      : aspect === "1:1"
      ? "square framing for social feed"
      : "widescreen framing";

  const userMsg =
    `Arabic ad description: "${arabic}"\n` +
    `Target framing: ${framing}\n` +
    `Target engine: ${engine}\n` +
    `Write the English video prompt now.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userMsg,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 400,
    },
  });

  const text = (response && response.text ? response.text : "").trim();
  if (!text) throw new Error("لم يُرجع نموذج اللغة أي نص.");
  return text.replace(/^["'`]+|["'`]+$/g, "").trim();
}

// ----------------------------------------------------------------------------
//  الخطوة 2 — بناء مُدخلات fal حسب المحرك
// ----------------------------------------------------------------------------
// Veo يقبل فقط 4s/6s/8s — نختار أقرب قيمة مسموحة للمدة المطلوبة
function veoDuration(d) {
  const allowed = [4, 6, 8];
  const n = Number(d) || 8;
  let best = allowed[0];
  for (const a of allowed) {
    if (Math.abs(a - n) < Math.abs(best - n)) best = a;
  }
  return `${best}s`;
}

// Veo يقبل أبعاد 16:9 و 9:16 فقط — نحوّل 1:1 إلى أقرب أفقي
function veoAspect(a) {
  return a === "9:16" ? "9:16" : "16:9";
}

function buildFalInput({ engineId, prompt, aspect, audio, duration }) {
  const base = { prompt };

  if (engineId.startsWith("veo")) {
    base.aspect_ratio = veoAspect(aspect);   // 16:9 أو 9:16 فقط
    base.duration = veoDuration(duration);   // 4s/6s/8s فقط
    base.resolution = "720p";
    base.generate_audio = !!audio;           // الاسم الصحيح لـ Veo
    base.auto_fix = true;                     // إصلاح تلقائي للبرومبت إن خالف الفلترة
  } else if (engineId.startsWith("kling")) {
    base.aspect_ratio = aspect;
    if (duration) base.duration = String(duration);
  } else {
    // wan وغيره
    base.aspect_ratio = aspect;
  }
  return base;
}

// ============================================================================
//  الخادم
// ============================================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));


// خدمة الواجهة على المسار الرئيسي
app.get("/", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(INDEX_HTML);
});

// فحص صحة
app.get("/health", (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL })
);

// --- نقطة 1: تحسين البرومبت فقط (تستدعيها الواجهة لإظهار الترجمة) ----------
app.post("/api/build-prompt", async (req, res) => {
  try {
    const { arabic, aspect, engine } = req.body || {};
    if (!arabic || typeof arabic !== "string" || !arabic.trim()) {
      return res.status(400).json({ error: "الحقل arabic مطلوب." });
    }
    if (arabic.length > 2000) {
      return res.status(400).json({ error: "النص طويل جداً (الحد 2000 حرف)." });
    }
    const prompt = await buildPrompt({ arabic: arabic.trim(), aspect, engine });
    return res.json({ prompt });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("build-prompt failed:", msg);
    return res.status(502).json({ error: "تعذّر توليد البرومبت.", detail: msg });
  }
});

// --- نقطة 2: بدء توليد الفيديو (يرجّع request_id فوراً) --------------------
app.post("/api/generate", async (req, res) => {
  try {
    const { arabic, engineId, aspect, audio, duration, englishPrompt } =
      req.body || {};

    const engId = engineId && FAL_ENDPOINTS[engineId] ? engineId : "veo-3.1";
    const endpoint = FAL_ENDPOINTS[engId];

    // استخدم البرومبت الإنجليزي إن أرسلته الواجهة، وإلا ابنِه الآن من العربي
    let prompt = (englishPrompt || "").trim();
    if (!prompt) {
      if (!arabic || !arabic.trim()) {
        return res
          .status(400)
          .json({ error: "أرسل arabic أو englishPrompt." });
      }
      prompt = await buildPrompt({
        arabic: arabic.trim(),
        aspect,
        engine: engId,
      });
    }

    const input = buildFalInput({
      engineId: engId,
      prompt,
      aspect: aspect || "9:16",
      audio,
      duration,
    });

    // إرسال للطابور والرجوع فوراً بـ request_id
    const submitted = await fal.queue.submit(endpoint, { input });

    return res.json({
      request_id: submitted.request_id,
      endpoint,
      prompt, // نرجّعه ليُعرض/يُحفظ في السجل
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("generate failed:", msg);
    return res
      .status(502)
      .json({ error: "تعذّر بدء توليد الفيديو.", detail: msg });
  }
});

// --- نقطة 3: متابعة الحالة حتى يجهز الفيديو --------------------------------
app.get("/api/status", async (req, res) => {
  try {
    const { request_id, endpoint } = req.query || {};
    if (!request_id || !endpoint) {
      return res
        .status(400)
        .json({ error: "request_id و endpoint مطلوبان." });
    }

    const status = await fal.queue.status(String(endpoint), {
      requestId: String(request_id),
      logs: false,
    });

    // ما زال قيد التنفيذ
    if (status.status !== "COMPLETED") {
      return res.json({ done: false, status: status.status });
    }

    // اكتمل — اجلب النتيجة
    const result = await fal.queue.result(String(endpoint), {
      requestId: String(request_id),
    });

    // مسارات شائعة لرابط الفيديو عبر نماذج fal المختلفة
    const data = result && result.data ? result.data : result;
    const videoUrl =
      (data && data.video && data.video.url) ||
      (data && data.videos && data.videos[0] && data.videos[0].url) ||
      null;

    if (!videoUrl) {
      return res.status(502).json({
        done: true,
        error: "اكتمل التوليد لكن لم يُعثر على رابط الفيديو.",
        raw: data,
      });
    }

    return res.json({ done: true, videoUrl });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("status failed:", msg);
    return res.status(502).json({ error: "تعذّر قراءة الحالة.", detail: msg });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`ProMotion يعمل على المنفذ ${PORT} — نموذج البرومبت: ${GEMINI_MODEL}`);
});
