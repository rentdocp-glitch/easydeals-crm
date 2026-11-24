import crypto from 'node:crypto';
const enc=new TextEncoder();
async function validSignature(raw, header, secret){
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.webcrypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.webcrypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7).toLowerCase();
  if (got.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
const body='{"entry":[{"changes":[{"value":{"messages":[{"from":"919876543210","text":{"body":"STOP"}}]}}]}]}';
const good='sha256='+crypto.createHmac('sha256','test-secret').update(body).digest('hex');
console.log('valid sig:',await validSignature(body,good,'test-secret'));
console.log('wrong secret:',await validSignature(body,good,'other'));
console.log('tampered body:',await validSignature(body.replace('STOP','HI'),good,'test-secret'));
console.log('missing header:',await validSignature(body,null,'test-secret'));
