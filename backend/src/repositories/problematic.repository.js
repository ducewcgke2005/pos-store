const { Problematic } = require('../models');
const { options, clean, insert } = require('./helpers');
exports.create = async (data) => insert(Problematic, data);
exports.getReports = async ({ userId, isManager, filters = {} }) => {
    const filter = {
        ...(!isManager ? { reportedBy: userId } : {}),
        ...(filters.status && filters.status !== 'ALL'
            ? { status: filters.status }
            : {})
    };
    if (filters.createdFrom || filters.createdTo) {
        filter.createdAt = {};
        if (filters.createdFrom)
            filter.createdAt.$gte = new Date(filters.createdFrom);
        if (filters.createdTo)
            filter.createdAt.$lte = new Date(
                `${String(filters.createdTo).slice(0, 10)}T23:59:59.999+07:00`
            );
    }
    return clean(
        await Problematic.find(filter, null, options())
            .sort({ createdAt: -1, id: -1 })
            .lean()
            .exec()
    );
};
exports.getById = async (id) =>
    clean(await Problematic.findOne({ id }, null, options()).lean().exec());
exports.updateStatus = async ({ reportId: id, status }) =>
    clean(
        await Problematic.findOneAndUpdate(
            { id },
            { $set: { status } },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
