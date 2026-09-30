const test=require('node:test'),assert=require('node:assert/strict');
const {hashPassword,verifyPassword,validPassword}=require('./passwordService');
test('salted scrypt hashes verify without storing plaintext or truncating passwords',async()=>{
    const password='a unique long passphrase 🔒';
    const first=await hashPassword(password),second=await hashPassword(password);
    assert.notEqual(first,second);assert(!first.includes(password));
    assert(await verifyPassword(password,first));
    assert.equal(await verifyPassword(password+'!',first),false);
    assert.equal(await verifyPassword(password,null),false);
    assert.equal(validPassword('short'),false);assert.equal(validPassword('a'.repeat(129)),false);
});
