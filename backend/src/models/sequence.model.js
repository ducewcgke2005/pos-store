const { define } = require('./schema');
module.exports = define('Sequence', 'sequences', {
    _id: { type: String, required: true },
    value: {
        type: Number,
        required: true,
        min: 0,
        max: Number.MAX_SAFE_INTEGER
    }
});
