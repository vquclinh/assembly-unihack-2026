const fs=require("fs"),path=require("path");
const [name,address,chainId="43113"]=process.argv.slice(2);
const API="https://sourcify.dev/server",headers={"content-type":"application/json","user-agent":"coc-verify-sourcify/1.0"};
const dir=path.join(__dirname,"..","artifacts","build-info");let build,file;
for(const f of fs.readdirSync(dir)){const b=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));file=Object.keys(b.output.contracts||{}).find(k=>b.output.contracts[k][name]);if(file){build=b;break}}
if(!build){console.log("No build of "+name);process.exit(1)}
(async()=>{
const res=await fetch(`${API}/v2/verify/${chainId}/${address}`,{method:"POST",headers,body:JSON.stringify({stdJsonInput:build.input,compilerVersion:build.solcLongVersion,contractIdentifier:`${file}:${name}`})});
const job=await res.json();if(!res.ok){console.log("Refused:",JSON.stringify(job,null,2));process.exit(1)}
console.log("Submitted, job",job.verificationId,"- waiting...");
for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,5000));const s=await(await fetch(`${API}/v2/verify/${job.verificationId}`,{headers})).json();
if(!s.isJobCompleted)continue;
if(s.error){console.log("Failed:",s.error.customCode,"-",s.error.message);process.exit(1)}
console.log("Verified:",s.contract.match);console.log(`Source: https://repo.sourcify.dev/${chainId}/${address}`);
for(const[k,v]of Object.entries(s.externalVerifications||{}))console.log(k+":",v.error?"not done ("+v.error+")":(v.explorerUrl||v.statusUrl||"submitted"));return}
console.log("Still running: "+API+"/v2/verify/"+job.verificationId)})().catch(e=>{console.log("Request failed:",e.message);process.exit(1)});
