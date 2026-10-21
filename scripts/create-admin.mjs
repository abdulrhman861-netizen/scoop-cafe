import crypto from 'node:crypto';
import readline from 'node:readline/promises';
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const username=(await rl.question('Admin username [admin]: ')).trim().toLowerCase()||'admin';
if(!/^[a-z][a-z0-9._-]{2,39}$/.test(username)){console.error('Use 3-40 lowercase letters, numbers, dots or hyphens.');process.exit(1)}
rl.close();
async function hidden(prompt){process.stdout.write(prompt);if(!process.stdin.isTTY)throw Error('Run this command in an interactive terminal.');process.stdin.setRawMode(true);process.stdin.resume();return new Promise(resolve=>{let value='';const onData=b=>{for(const c of b.toString()){if(c==='\u0003')process.exit(130);if(c==='\r'||c==='\n'){process.stdin.removeListener('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return}if(c==='\u007f'||c==='\b'){value=value.slice(0,-1);continue}if(c>=' ')value+=c;}};process.stdin.on('data',onData)})}
const password=await hidden('New admin password (10+ characters, hidden): ');const confirm=await hidden('Confirm password (hidden): ');
if(password!==confirm||password.length<10||password.length>128){console.error('Passwords must match and contain 10-128 characters.');process.exit(1)}
const salt=crypto.randomUUID(),hash=crypto.pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
console.log('\nCopy this JSON into the Vercel variable STAFF_ADMIN_BOOTSTRAP:');
console.log(JSON.stringify({username,name:'مدير سكوب',role:'manager',salt,hash,version:crypto.randomUUID()}));
console.log('\nThe plaintext password was not saved. Use your chosen password to sign in at /admin.');
