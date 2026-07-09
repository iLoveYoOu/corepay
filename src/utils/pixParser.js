function readTLV(str) {
    const result = {};
    let i = 0;

    while (i < str.length) {
        const id = str.substring(i, i + 2);
        const len = parseInt(str.substring(i + 2, i + 4), 10);

        if (isNaN(len)) break;

        const value = str.substring(i + 4, i + 4 + len);

        result[id] = value;

        i += 4 + len;
    }

    return result;
}

function parsePixEmv(emv) {

    emv = String(emv || '')
        .replace(/\s/g, '')
        .trim();

    if (!emv.startsWith('000201')) {
        throw new Error('Pix inválido.');
    }

    const tlv = readTLV(emv);

    const amount = tlv["54"] ? Number(tlv["54"]) : null;

    if (!amount) {
        throw new Error('Pix sem valor fixo.');
    }

    return {

        amount,

        merchant: tlv["59"] || "",

        city: tlv["60"] || "",

        txid: tlv["62"] || "",

        raw: emv

    };

}

module.exports = {

    parsePixEmv

};