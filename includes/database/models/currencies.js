const { Schema } = require("mongoose");

module.exports = function ({ mongoose }) {
	const schema = new Schema(
		{
			userID: { type: String, unique: true, required: true, index: true },
			money: { type: Number, default: 0 },
			exp: { type: Number, default: 0 },
			data: { type: Schema.Types.Mixed, default: {} }
		},
		{ timestamps: true }
	);

	return mongoose.models.Currencies || mongoose.model("Currencies", schema);
};
