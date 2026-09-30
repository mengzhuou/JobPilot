const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const derive = promisify(scrypt);
const options = { N: 65536, r: 8, p: 2, maxmem: 80 * 1024 * 1024 };
const dummy = `scrypt$65536$8$2$${'00'.repeat(16)}$${'00'.repeat(64)}`;
let active = 0;
const run = async (password, salt) => {
    if (active >= 2) throw Object.assign(new Error('Sign-in is busy. Please try again shortly.'), { statusCode: 503 });
    active++;
    try { return await derive(password, salt, 64, options); }
    finally { active--; }
};
const validPassword = password => typeof password === 'string' && password.length >= 15 && password.length <= 128;
const hashPassword = async password => {
    if (!validPassword(password)) throw new Error('Use a password between 15 and 128 characters.');
    const salt = randomBytes(16).toString('hex');
    return `scrypt$65536$8$2$${salt}$${(await run(password, salt)).toString('hex')}`;
};
const verifyPassword = async (password, encoded) => {
    const validHash = typeof encoded === 'string' && /^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded);
    const parts = (validHash ? encoded : dummy).split('$');
    // Unknown and Google-only accounts still perform the same expensive work.
    const actual = await run(password, parts[4]);
    return timingSafeEqual(actual, Buffer.from(parts[5], 'hex')) && validHash;
};
module.exports = { hashPassword, verifyPassword, validPassword };
