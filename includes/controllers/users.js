module.exports = function ({ models, api }) {
	const Users = models.use('Users');

	function toPlain(doc) {
		if (!doc) return false;
		const obj = doc.toObject({ versionKey: false });
		obj.num = obj._id;
		return obj;
	}

	async function getInfo(id) {
		return (await api.getUserInfo(id))[id];
	}

	async function getNameUser(id) {
		try {
			if (global.data.userName.has(id)) return global.data.userName.get(id);
			else if (global.data.allUserID.includes(id)) {
				const nameUser = (await this.getData(id)).name;
				if (nameUser) return nameUser;
				else return "Facebook users";
			} else return "Facebook users";
		}
		catch { return "Facebook users" }
	}

	async function getAll(...data) {
		var where = {}, attributes;
		for (const i of data) {
			if (typeof i != 'object') throw global.getText("users", "needObjectOrArray");
			if (Array.isArray(i)) attributes = i;
			else where = i;
		}
		try {
			const query = Users.find(where);
			if (attributes) query.select(attributes.join(' '));
			return (await query.exec()).map(toPlain);
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function getData(userID) {
		try {
			const data = await Users.findOne({ userID: String(userID) });
			return toPlain(data);
		}
		catch(error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function setData(userID, options = {}) {
		if (typeof options != 'object' && !Array.isArray(options)) throw global.getText("users", "needObject");
		try {
			const doc = await Users.findOneAndUpdate({ userID: String(userID) }, { $set: options });
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
			await Users.deleteOne({ userID: String(userID) });
			return true;
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function createData(userID, defaults = {}) {
		if (typeof defaults != 'object' && !Array.isArray(defaults)) throw global.getText("users", "needObject");
		try {
			await Users.findOneAndUpdate(
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

	return {
		getInfo,
		getNameUser,
		getAll,
		getData,
		setData,
		delData,
		createData
	};
};
