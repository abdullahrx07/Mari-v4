module.exports = function (input) {
	const Users = require("./models/users")(input);
	const Threads = require("./models/threads")(input);
	const Currencies = require("./models/currencies")(input);
	const System = require("./models/system")(input);

	return {
		model: {
			Users,
			Threads,
			Currencies,
			System
		},
		use: function (modelName) {
			return this.model[`${modelName}`];
		}
	};
};
