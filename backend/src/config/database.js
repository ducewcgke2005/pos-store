const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });
const models = require('../models');
require('../models/sequence.model');
mongoose.set('bufferCommands', false);
const connectDB = async (uri = process.env.MONGODB_URI) => {
    if (!uri) throw new Error('MONGODB_URI is required');
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set is required for POS transactions');
    for (const Model of new Set(Object.values(models))) await Model.init();
    const Sequence = mongoose.model('Sequence');
    await Sequence.init();
    // Existing counter documents avoid first-use upsert races inside transactions.
    for (const Model of Object.values(models)) {
        if (Model.schema.path('id')) await Sequence.updateOne({ _id: Model.collection.name }, { $setOnInsert: { value: 0 } }, { upsert: true });
    }
    return mongoose.connection;
};
module.exports = { connectDB, disconnectDB: () => mongoose.disconnect() };
