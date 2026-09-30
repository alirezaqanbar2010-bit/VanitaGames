import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:1024*1024*1024}});
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

const admin=(req,res,next)=>{
  const h=req.headers.authorization||'';
  if(!h.startsWith('Basic ')) return res.status(401).json({error:'Unauthorized'});
  const raw=Buffer.from(h.slice(6),'base64').toString();
  const [u,p]=raw.split(':');
  if(u!==process.env.ADMIN_USERNAME||p!==process.env.ADMIN_PASSWORD) return res.status(401).json({error:'Unauthorized'});
  next();
};

async function putFile(file){
  if(!file)return '';
  const safe=file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_');
  const key=`${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const {error}=await supabase.storage.from('games').upload(key,file.buffer,{contentType:file.mimetype,upsert:false});
  if(error)throw error;
  return supabase.storage.from('games').getPublicUrl(key).data.publicUrl;
}

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/games',admin,upload.fields([
  {name:'cover',maxCount:1},{name:'logo',maxCount:1},{name:'trailer',maxCount:1},
  {name:'gameFile',maxCount:1},{name:'screens',maxCount:12}
]),async(req,res)=>{
  try{
    const b=req.body, f=req.files||{};
    const cover=await putFile(f.cover?.[0]), logo=await putFile(f.logo?.[0]);
    const trailer=await putFile(f.trailer?.[0]), gameFile=await putFile(f.gameFile?.[0]);
    const {data:g,error}=await supabase.from('games').insert({
      name:b.name,genre:b.genre||'',version:b.version||'1.0.0',size:b.size||'',
      description:b.description||'',cover_url:cover,logo_url:logo,trailer_url:trailer,
      game_file_url:gameFile,game_file_name:f.gameFile?.[0]?.originalname||''
    }).select().single();
    if(error)throw error;
    const imgs=[];
    for(const x of (f.screens||[])){const url=await putFile(x);imgs.push({game_id:g.id,image_url:url});}
    if(imgs.length)await supabase.from('game_images').insert(imgs);
    res.json({ok:true,game:g});
  }catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/games/:id',admin,async(req,res)=>{
  const {error}=await supabase.from('games').delete().eq('id',req.params.id);
  if(error)return res.status(500).json({error:error.message});
  res.json({ok:true});
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT||3000,()=>console.log('VANTA GAMES online'));
