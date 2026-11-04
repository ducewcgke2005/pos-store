const userRepository = require("../repositories/user.repository")

module.exports.getAllUser = async () => {
    return await userRepository.getAllUser();
}