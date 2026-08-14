"use strict";
// Builds the 4 models (Users, Threads, Currencies, System) for whichever
// DB backend is active. `input` is the object returned by connectDatabase():
//   { type: "mongodb", mongoose }   -> builds real Mongoose models
//   { type: "sqlite",  sqliteDb }   -> builds SQLiteModel shims (same API)
module.exports = function (input) {
	if (input && input.type === "sqlite") {
		const { SQLiteModel } = require("./sqliteAdapter");
		const db = input.sqliteDb;

		const Users = new SQLiteModel("users", "userID", db);
		const Threads = new SQLiteModel("threads", "threadID", db);
		const Currencies = new SQLiteModel("currencies", "userID", db);
		const System = new SQLiteModel("system", "key", db);

		return {
			model: { Users, Threads, Currencies, System },
			use: function (modelName) {
				return this.model[`${modelName}`];
			},
		};
	}

	// ── default: MongoDB / Mongoose ──────────────────────────────────────
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
