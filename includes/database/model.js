module.exports = function (input) {
	const Users = require("./models/users")(input);
	const Threads = require("./models/threads")(input);
	const Currencies = require("./models/currencies")(input);

	return {
		model: {
			Users,
			Threads,
			Currencies
		},
		use: function (modelName) {
			return this.model[`${modelName}`];
		}
	};
};
