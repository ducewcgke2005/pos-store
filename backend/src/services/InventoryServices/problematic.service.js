const reportRepository = require("../../repositories/problematic.repository");
const staffRepository = require("../../repositories/staff.repository");

const createReport = async (data, user) => {

    if (!user.permissions.includes("CREATE_PROBLEMATIC")) {
    throw new Error("PERMISSION_DENIED");
}

    if (!data.title || data.title.trim() === "") {
        throw new Error("TITLE_REQUIRED");
    }

    if (!data.issueDescription || data.issueDescription.trim() === "") {
        throw new Error("DESCRIPTION_REQUIRED");
    }

    const staff = await staffRepository.getStaffByUserId(user.id);

    if (!staff) {
        throw new Error("STAFF_NOT_FOUND");
    }

    return await reportRepository.create({
        title: data.title.trim(),
        issueDescription: data.issueDescription.trim(),
        reportedBy: staff.id
    });
};

const getReports = async ({ userId, roleId, filters }) => {

    const isManager = roleId === 1; 

    return reportRepository.getReports({
        userId,
        isManager,
        filters
    });
};

const updateStatus = async ({ reportId, status, roleId, updatedBy }) => {

    if (roleId !== 1) {
        throw new Error("PERMISSION_DENIED");
    }

    const validStatus = ["OPEN", "PROCESSED"];

    if (!validStatus.includes(status)) {
        throw new Error("INVALID_STATUS");
    }

    const existingReport = await reportRepository.getById(reportId);

    if (!existingReport) {
        throw new Error("REPORT_NOT_FOUND");
    }

    if (existingReport.status === "PROCESSED") {
        throw new Error("REPORT_ALREADY_PROCESSED");
    }

    return reportRepository.updateStatus({
        reportId,
        status,
        updatedBy
    });
};

module.exports = {
    createReport,
    getReports,
    updateStatus
};