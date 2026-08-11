const crypto = require('crypto');

class WXBizMsgCrypt {
  constructor(token, encodingAESKey, corpId) {
    this.token = token;
    this.key = Buffer.from(encodingAESKey + '=', 'base64');
    this.iv = this.key.slice(0, 16);
    this.corpId = corpId;
  }

  decrypt(msgEncrypt) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
    decipher.setAutoPadding(false);

    let decrypted = Buffer.concat([
      decipher.update(msgEncrypt, 'base64'),
      decipher.final()
    ]);

    decrypted = this.PKCS7Decoder(decrypted);

    const content = decrypted.slice(16);
    const length = content.slice(0, 4).readUInt32BE(0);
    const message = content.slice(4, length + 4).toString();
    const receivedCorpId = content.slice(length + 4).toString();

    if (receivedCorpId !== this.corpId) {
      throw new Error('CorpId mismatch');
    }

    return message;
  }

  encrypt(text, nonce) {
    const random = crypto.randomBytes(16);
    const msg = Buffer.from(text);
    const msgLength = Buffer.alloc(4);
    msgLength.writeUInt32BE(msg.length, 0);

    const corpIdBuffer = Buffer.from(this.corpId);
    const content = Buffer.concat([random, msgLength, msg, corpIdBuffer]);

    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, this.iv);
    cipher.setAutoPadding(false);

    const padded = this.PKCS7Encoder(content);
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

    return encrypted.toString('base64');
  }

  getSignature(timestamp, nonce, encrypt) {
    const array = [this.token, timestamp, nonce, encrypt].sort();
    const str = array.join('');
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    return sha1.digest('hex');
  }

  PKCS7Encoder(buffer) {
    const blockSize = 32;
    const padSize = blockSize - (buffer.length % blockSize);
    const pad = Buffer.alloc(padSize, padSize);
    return Buffer.concat([buffer, pad]);
  }

  PKCS7Decoder(buffer) {
    const pad = buffer[buffer.length - 1];
    if (pad < 1 || pad > 32) {
      return buffer;
    }
    return buffer.slice(0, buffer.length - pad);
  }
}

module.exports = WXBizMsgCrypt;
