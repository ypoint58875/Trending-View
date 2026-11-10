import {readFile,writeFile,rename,mkdir,stat,copyFile,appendFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const [candidatePath,ratesPath]=process.argv.slice(2);
if(!candidatePath||!ratesPath)throw new Error('Usage: node scripts/import-trend-auxiliary.mjs candidate.json rates.json');
const hash=v=>createHash('sha256').update(v).digest('hex');
async function read(path){if((await stat(path)).size>16*1024**2)throw new Error('Auxiliary input exceeds16MiB');return readFile(path);}
const candidateBytes=await read(candidatePath),rateBytes=await read(ratesPath),candidate=JSON.parse(candidateBytes),rates=JSON.parse(rateBytes);
if(candidate.status!=='complete'||rates.status!=='complete'||candidate.breadth.length>2000||candidate.vi.length>10000||candidate.vix.length>10000||rates.records.length>10000)throw new Error('Invalid completed auxiliary source');
const identity=hash(Buffer.concat([candidateBytes,rateBytes])),raw=join(root,'data/raw/trend-auxiliary',identity);
await mkdir(raw,{recursive:true});await copyFile(candidatePath,join(raw,'candidate.json'));await copyFile(ratesPath,join(raw,'rates.json'));
const metadata={model:'trend-auxiliary-snapshot-v1',identity,candidateHash:hash(candidateBytes),ratesHash:hash(rateBytes),createdAt:candidate.createdAt,rateSources:rates.sources};
const output={metadata,breadth:candidate.breadth.map(({date,above50,above200,above200YoY,coverage50,coverage200})=>({date,above50,above200,above200YoY,coverage50,coverage200})),vi:candidate.vi,vix:candidate.vix,rates:rates.records};
const target=join(root,'data/processed/trend-auxiliary.json');await writeFile(target+'.tmp',JSON.stringify(output));await rename(target+'.tmp',target);
const registry=join(root,'data/trend-auxiliary-source-registry.jsonl');let existing='';try{existing=await readFile(registry,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(!existing.includes(identity))await appendFile(registry,JSON.stringify({...metadata,accessedAt:new Date().toISOString(),candidatePath,ratesPath,rawBackup:raw})+'\n');
console.log(JSON.stringify({status:'complete',identity,bytes:(await stat(target)).size}));
