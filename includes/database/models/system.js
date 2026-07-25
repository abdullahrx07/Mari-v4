const { Schema } = require("mongoose");

module.exports = function ({ mongoose }) {
	const schema = new Schema(
		{
			key: { type: String, unique: true, required: true, index: true },
			value: { type: Schema.Types.Mixed, default: {} }
		},
		{ timestamps: true }
	);

	return mongoose.models.System || mongoose.model("System", schema);
};
