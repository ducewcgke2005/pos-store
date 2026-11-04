const dashboardRepository = require('../repositories/dashboard.repository');
class DashboardService {
    async getSummary() { return dashboardRepository.getSummary(); }
}
module.exports = new DashboardService();
