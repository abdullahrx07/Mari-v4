module.exports = function ({ models }) {
	const Currencies = models.use('Currencies');

	function toPlain(doc) {
		if (!doc) return false;
		const obj = doc.toObject({ versionKey: false });
		obj.num = obj._id;
		return obj;
	}

	async function getAll(...data) {
		var where = {}, attributes;
		for (const i of data) {
			if (typeof i != 'object') throw global.getText("currencies", "needObjectOrArray");
			if (Array.isArray(i)) attributes = i;
			else where = i;
		}
		try {
			const query = Currencies.find(where);
			if (attributes) query.select(attributes.join(' '));
			return (await query.exec()).map(toPlain);
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		};
	}

	async function getData(userID) {
		try {
			const data = await Currencies.findOne({ userID: String(userID) });
			return toPlain(data);
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		};
	}

	async function setData(userID, options = {}) {
		if (typeof options != 'object' && !Array.isArray(options)) throw global.getText("currencies", "needObject");
		try {
			const doc = await Currencies.findOneAndUpdate({ userID: String(userID) }, { $set: options });
			if (!doc) throw new Error("not_found");
			return true;
		}
		catch (error) {
			try {
				await this.createData(userID, options);
			} catch (error) {
				console.error(error);
				throw new Error(error);
			}
		}
	}

	async function delData(userID) {
		try {
			await Currencies.deleteOne({ userID: String(userID) });
			return true;
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function createData(userID, defaults = {}) {
		if (typeof defaults != 'object' && !Array.isArray(defaults)) throw global.getText("currencies", "needObject");
		try {
			await Currencies.findOneAndUpdate(
				{ userID: String(userID) },
				{ $setOnInsert: Object.assign({ userID: String(userID) }, defaults) },
				{ upsert: true, new: true, setDefaultsOnInsert: true }
			);
			return true;
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	// Atomic increment/decrement — avoids the read-modify-write race the
	// original getData()+setData() pair had under concurrent messages.
	async function increaseMoney(userID, money) {
		if (typeof money != 'number') throw global.getText("currencies", "needNumber");
		try {
			await Currencies.findOneAndUpdate(
				{ userID: String(userID) },
				{ $inc: { money } },
				{ upsert: true }
			);
			return true;
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function decreaseMoney(userID, money) {
		if (typeof money != 'number') throw global.getText("currencies", "needNumber");
		try {
			const current = await getData(userID);
			const balance = current ? (current.money || 0) : 0;
			if (balance < money) return false;
			await Currencies.findOneAndUpdate({ userID: String(userID) }, { $inc: { money: -money } });
			return true;
		} catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	return {
		getAll,
		getData,
		setData,
		delData,
		createData,
		increaseMoney,
		decreaseMoney
	};
};
