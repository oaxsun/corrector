const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 10000;
const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || 'https://api.languagetool.org/v2/check';

app.use(cors());
app.use(express.json({limit:'1mb'}));

function buildRequestBody(text, language='es'){
  const params = new URLSearchParams();
  params.set('text', text);
  params.set('language', language);
  return params;
}

async function requestLanguageTool(text, language){
  const body = buildRequestBody(text, language);
  const response = await fetch(LANGUAGETOOL_URL, {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: body.toString()
  });
  if(!response.ok){
    throw new Error("LanguageTool error");
  }
  return response.json();
}

app.get('/health',(req,res)=>{
  res.json({ok:true});
});

app.post('/api/check', async(req,res)=>{
  try{
    const text = String(req.body.text || '');
    const data = await requestLanguageTool(text,'es');
    res.json({ok:true, matches:data.matches});
  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
});

app.listen(PORT,'0.0.0.0',()=>{
  console.log("Server running on",PORT);
});