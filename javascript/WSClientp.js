// Include crypto-js library if you need to use doLoginPortal

//Session Expiry event
if (typeof window.coreBOS == 'undefined') {
	window.coreBOS = {};
}
window.coreBOS.SessionExpired = new CustomEvent('coreBOSSessionExpiredEvent', {});
//Authorization Required event
window.coreBOS.AuthorizationRequired = new CustomEvent('coreBOSAuthorizationRequiredEvent', {});

var cbWSClient = function (url) {
	this._servicebase = 'webservice.php';
	if (url!='' && url.substr(url.length - 1) != '/') {
		// Format the url before appending servicebase
		url = url + '/';
	}

	this._serviceurl = url + this._servicebase;

	// Webservice user credentials
	this._serviceuser= false;
	this._servicekey = false;

	// Webservice login validity
	this._servertime = false;
	this._expiretime = false;
	this._servicetoken=false;

	// Webservice login credentials
	this._sessionid  = false;
	this._userid     = false;
	this._cbwsOptions = [];

	// Webservice login user data
	this._entityid = '';
	this._language = '';

	// Last operation error information
	this._lasterror  = false;

	// Version
	this.version = 'coreBOS2.1';

	this.fetchOptions = {
		mode: 'cors',
		headers: {
			'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'corebos-authorization': this._sessionid,
		}
	};

	this.setSession = function(logindata) {
		this._sessionid = logindata?.sessionName;
		this._userid = logindata?.userId;
		if (this.fetchOptions && this.fetchOptions.headers) {
			this.fetchOptions.headers.corebos_authorization = logindata?.sessionName;
		}
	}

	this.getSession = function() {
		return {
			'sessionName': this._sessionid,
			'userId': this._userid
		};
	}

	this.setURL = function (cburl, fetchingOptions=null) {
		if (cburl!=='') {
			// Format the url before appending servicebase
			this._serviceurl = cburl + (cburl.substr(cburl.length - 1) === '/' ? '' : '/') + this._servicebase;
		}
		if (fetchingOptions) {
			this.fetchOptions.mode = fetchingOptions.mode;
			this.fetchOptions.headers = fetchingOptions.headers;
		}
	}

	this.getEntityId = function() {
		return {
			'entityid': _entityid,
		};
	}

	this.getLanguage = function() {
		return {
			'language': _language,
		};
	}

	/**
	 * valueMapParam = 'elements' || 'element'
	 */
	this.addcbWsOptions = function(operation, valueMap=null, resource='', valueMapParam = 'element') {
		let reqData = `operation=${operation}&sessionName=${this._sessionid}`;
		if(valueMap && (typeof valueMap  === 'object' || Array.isArray(valueMap))){
			reqData += `&${valueMapParam}=${JSON.stringify(valueMap)}`;
		}
		if(resource){
			reqData += `&elementType=${resource}`;
		}
		if (this._cbwsOptions && this._cbwsOptions.length > 0) {
			reqData += `&cbwsOptions=${JSON.stringify(this._cbwsOptions)}`;
			this._cbwsOptions = [];
		}

		return reqData;
	}

	/**
	 * Get actual record id from the response id.
	 */
	this.getRecordId = function (id) {
		if (typeof id === 'undefined') {
			return 0;
		}
		var ids = id.split('x');
		return ids[1];
	};

	/**
	 * Check if result has any error.
	 */
	this.hasError = function (resultdata) {
		if (resultdata != null && !resultdata['success']) {
			this._lasterror = resultdata['error'].code + ': ' + resultdata['error'].message;
			return true;
		}
		this._lasterror = 'none';
		return false;
	};

	/**
	 * Get last operation error information
	 */
	this.lastError = function () {
		return this._lasterror;
	};

	/* parse return status */
	this.status = function (response) {
		if (response.status >= 200 && response.status < 300) {
			return Promise.resolve(response);
		} else {
			return Promise.reject(new Error(response.statusText));
		}
	};

	/* get data from response */
	this.getData = function (response) {
		return response.json();
	};

	/**
	 * Perform the challenge
	 * @access private
	 */
	this.__doChallenge = function (username) {
		let params = '?operation=getchallenge&username=' + username;
		this.fetchOptions.method = 'get';
		return fetch(this._serviceurl + params, this.fetchOptions)
			.then(this.status)
			.then(this.getData);
	};

	/**
	 * Login Operation
	 */
	this.doLogin = function (username, accesskey, withpassword) {
		this._serviceuser = username;
		this._servicekey = accesskey;
		if (withpassword == undefined) {
			withpassword = false;
		}
		let myself = this;

		return new Promise((resolve, reject) => {
			this.__doChallenge(username)
				.then(function (data) {
					if (!myself.hasError(data)) {
						let result = data['result'];
						myself._servicetoken = result.token;
						myself._servertime = result.serverTime;
						myself._expiretime = result.expireTime;
						myself.fetchOptions.method = 'post';
						let postdata = 'operation=login&username=' + username;
						postdata += '&accessKey=' + (withpassword ? myself._servicetoken + accesskey : cbMD5(myself._servicetoken + accesskey));
						myself.fetchOptions.body = postdata;

						fetch(myself._serviceurl, myself.fetchOptions)
							.then(myself.status)
							.then(myself.getData)
							.then(logindata => {
								if (!myself.hasError(logindata)) {
									var rdo = logindata['result'];
									myself._sessionid = rdo.sessionName;
									myself._userid = rdo.userId;
									resolve(logindata);
								} else {
									reject(new Error('incorrect response: ' + myself.lastError()));
								}
							})
							.catch(error => reject(error));
					} else {
						reject(new Error('incorrect response: ' + myself.lastError()));
					}
				})
				.catch(error => reject(error));
		});
	};

	/**
	 * Login Operation
	 */
	this.doLoginPortal = function (username, password, hashmethod, entity) {
		// reqtype = 'GET';
		let myself = this;

		return new Promise((resolve, reject) => {
			this.__doChallenge(username)
				.then(function (data) {
					if (myself.hasError(data) == false) {
						let result = data['result'];
						myself._servicetoken = result.token;
						myself._servertime = result.serverTime;
						myself._expiretime = result.expireTime;
						myself.fetchOptions.method = 'get';
						let postdata = '?operation=loginPortal&username=' + username + '&entity=' + entity || 'Contacts';
						let hashed = ''

						switch (hashmethod) {
							case 'sha256':
								hashed = CryptoJS.SHA256(myself._servicetoken + password).toString();
								break;
							case 'sha512':
								hashed = CryptoJS.SHA512(myself._servicetoken + password).toString();
								break;
							case 'plaintext':
								hashed = myself._servicetoken + password;
								break;
							case 'md5':
							default:
								hashed = cbMD5(myself._servicetoken + password);
								break;
						}

						postdata += '&password=' + hashed;

						myself.fetchOptions.body = postdata;

						fetch(myself._serviceurl + postdata, myself.fetchOptions)
							.then(myself.status)
							.then(myself.getData)
							.then(logindata => {
								if (!myself.hasError(logindata)) {
									var result = logindata['result'];
									myself._sessionid = result.sessionName;
									myself._serviceuser = result.user.user_name;
									myself._servicekey = result.user.accesskey;
									myself._userid = result.userId;
									myself._entityid = result.entityid;
									myself._language = result.language;
									resolve(logindata);
								} else {
									reject(new Error('incorrect response: ' + myself.lastError()));
								}
							})
							.catch(error => reject(error));
					} else {
						reject(new Error('incorrect response: ' + myself.lastError()));
					}
				})
				.catch(error => reject(error));
		});
	};

	/**
	 * Logout Operation
	 */
	this.doLogout = function () {
		let postdata = 'operation=logout&sessionName=' + this._sessionid;
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					myself._servicetoken = false;
					myself._servertime = false;
					myself._expiretime = false;
					myself._sessionid  = false;
					myself._userid = false;
					return Promise.resolve(data['result']);
				} else {
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	this.extendSession = function () {
		let postdata = 'operation=extendsession';
		this.fetchOptions.body = postdata;
		this.fetchOptions.credentials = 'include';
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					myself._sessionid  = data['result'].sessionName;
					myself._userid = data['result'].userId;
					delete myself.fetchOptions.credentials;
					return Promise.resolve(data['result']);
				} else {
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Query Operation.
	 */
	this.doQuery = function (query) {
		if (query.indexOf(';') == -1) {
			query += ';';
		}

		let params = '?operation=query&sessionName=' + this._sessionid + '&query=' + query;
		this.fetchOptions.method = 'get';
		delete this.fetchOptions.body;
		let myself = this;
		return fetch(this._serviceurl + params, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Query Operation with Totals.
	 */
	this.doQueryWithTotal = function (query) {
		if (query.indexOf(';') == -1) {
			query += ';';
		}

		let params = '?operation=query&sessionName=' + this._sessionid + '&query=' + query;
		this.fetchOptions.method = 'get';
		delete this.fetchOptions.body;
		let myself = this;
		return fetch(this._serviceurl + params, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve({'result': data['result'], 'totalrows': data['moreinfo']['totalrows']});
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Get Result Column Names.
	 */
	this.getResultColumns = function (result) {
		let columns = [];
		if (result != null && result.length != 0) {
			let firstrecord = result[0];
			for (let key in firstrecord) {
				columns.push(key);
			}
		}
		return columns;
	};

	/**
	 * List types (modules) available.
	 */
	this.doListTypes = function () {
		let params = '?operation=listtypes&sessionName=' + this._sessionid;
		this.fetchOptions.method = 'get';
		delete this.fetchOptions.body;
		let myself = this;
		return fetch(this._serviceurl + params, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					let result = data['result'];
					let modulenames = result['types'];
					let returnvalue = { };
					for (let mindex = 0; mindex < modulenames.length; ++mindex) {
						let modulename = modulenames[mindex];
						returnvalue[modulename] = {
							'name' : modulename
						};
					}
					return Promise.resolve(returnvalue);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Describe Operation
	 */
	this.doDescribe = function (module) {
		let params = '?operation=describe&sessionName=' + this._sessionid + '&elementType=' + module;
		this.fetchOptions.method = 'get';
		delete this.fetchOptions.body;
		let myself = this;
		return fetch(this._serviceurl + params, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Retrieve details of record
	 */
	this.doRetrieve = function (record) {
		let params = '?operation=retrieve&sessionName=' + this._sessionid + '&id=' + record;
		this.fetchOptions.method = 'get';
		delete this.fetchOptions.body;
		let myself = this;
		return fetch(this._serviceurl + params, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Create Operation
	 */
	this.doCreate = function (module, valuemap) {
		// Assign record to logged in user if not specified
		if (valuemap['assigned_user_id'] == null) {
			valuemap['assigned_user_id'] = this._userid;
		}

		let postdata = this.addcbWsOptions('create', valuemap, module, 'element');
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Update Operation
	 */
	this.doUpdate = function (module, valuemap) {
		// Assign record to logged in user if not specified
		if (valuemap['assigned_user_id'] == null) {
			valuemap['assigned_user_id'] = this._userid;
		}

		let postdata = this.addcbWsOptions('update', valuemap, module, 'element');
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Revise Operation
	 */
	this.doRevise = function (module, valuemap) {
		let postdata = this.addcbWsOptions('revise', valuemap, module, 'element');
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Delete Operation
	 */
	this.doDelete = function (id) {
		let postdata = 'operation=delete&sessionName=' + this._sessionid + '&id=' + id;
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Invoke custom operation
	 */
	this.doInvoke = function (method, params, type) {
		if (typeof(params) == 'undefined') {
			params = {};
		}

		var reqtype = 'post';
		if (typeof(type) != 'undefined') {
			reqtype = type.toUpperCase();
		}

		let postdata = this.addcbWsOptions(method);
		for (let key in params) {
			postdata += '&' + key + '=' + params[key];
		}
		let getparams = '';
		if (reqtype.toLowerCase()=='post') {
			this.fetchOptions.body = postdata;
		} else {
			delete this.fetchOptions.body;
			getparams = '?' + postdata;
		}
		this.fetchOptions.method = reqtype;
		let myself = this;
		return fetch(this._serviceurl + getparams, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Validate Information
	 */
	this.doValidateInformation = function (record, module, recordInformation) {
		// reqtype = 'POST';
		recordInformation.module = recordInformation.module || module;
		recordInformation.record = recordInformation.record || record;
		let postdata = 'operation=ValidateInformation&sessionName=' + this._sessionid;
		postdata += '&context=' + JSON.stringify(recordInformation);
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (data.success) {
					return Promise.resolve(data['result']);
				} else {
					return Promise.reject(data['result']);
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Retrieve related records.
	 */
	this.doGetRelatedRecords = function (record, module, relatedModule, queryParameters) {
		let postdata = 'operation=getRelatedRecords&sessionName=' + this._sessionid + '&id=' + record + '&module=' + module;
		postdata += '&relatedModule=' + relatedModule + '&queryParameters=' + JSON.stringify(queryParameters);
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Set relation between records.
	 * param relate_this_id string ID of record we want to related other records with
	 * param with_this_ids string/array either a string with one unique ID or an array of IDs to relate to the first parameter
	 */
	this.doSetRelated = function (relate_this_id, with_these_ids) {
		let postdata = 'operation=SetRelation&sessionName=' + this._sessionid + '&relate_this_id=' + relate_this_id + '&with_these_ids=' + JSON.stringify(with_these_ids);
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'get';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Upsert Operation
	 */
	this.doUpsert = function (module, createFields, searchOn, updateFields) {
		let postdata = 'operation=upsert&sessionName='+this._sessionid+'&elementType='+module+'&element='+JSON.stringify(createFields);
		postdata += '&searchOn=' + searchOn + '&updatedfields=' + updateFields;
		if (this._cbwsOptions && this._cbwsOptions.length > 0) {
			postdata += `&cbwsOptions=${JSON.stringify(this._cbwsOptions)}`;
			this._cbwsOptions = [];
		}
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Mass Update Operation
	 */
	this.doMassUpdate = function (elements) {
		let postdata = this.addcbWsOptions('MassUpdate', elements, '', 'elements');
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Mass Upsert Operation
	 */
	this.doMassUpsert = function (elements) {
		let postdata = this.addcbWsOptions('MassCreate', elements, '', 'elements');
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Mass Retrieve Operation
	 */
	this.doMassRetrieve = function (ids) {
		let postdata = 'operation=MassRetrieve&sessionName=' + this._sessionid + '&ids=' + ids;
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};

	/**
	 * Mass Delete Operation
	 */
	this.doMassDelete = function (ids) {
		let postdata = 'operation=MassDelete&sessionName=' + this._sessionid + '&ids=' + ids;
		this.fetchOptions.body = postdata;
		this.fetchOptions.method = 'post';
		let myself = this;
		return fetch(this._serviceurl, this.fetchOptions)
			.then(this.status)
			.then(this.getData)
			.then(function (data) {
				if (!myself.hasError(data)) {
					return Promise.resolve(data['result']);
				} else {
					if (sessionValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.SessionExpired);
					}
					if (authorizationValidityDetector(data)) {
						window.dispatchEvent(window.coreBOS.AuthorizationRequired);
					}
					return Promise.reject(new Error('incorrect response: '+myself.lastError()));
				}
			})
			.catch(function (error) {
				return Promise.reject(error);
			});
	};
};

/**
 * Authorization Validity detector/Checker
 */
function authorizationValidityDetector(error) {
	//let errorCode = error.split(':')[1]?.trim() ?? '';
	return (error.success===false && error.error.code === 'AUTHENTICATION_REQUIRED');
}

/**
 * Session Validity detector/Checker
 */
function sessionValidityDetector(error) {
	//let errorCode = error.split(':')[1]?.trim() ?? '';
	return (error.success===false && error.error.code === 'INVALID_SESSIONID');
}

// MD5 (Message-Digest Algorithm) by WebToolkit
// eslint-disable-next-line
var cbMD5=function(s){function L(k,d){return(k<<d)|(k>>>(32-d))}function K(G,k){var I,d,F,H,x;F=(G&2147483648);H=(k&2147483648);I=(G&1073741824);d=(k&1073741824);x=(G&1073741823)+(k&1073741823);if(I&d){return(x^2147483648^F^H)}if(I|d){if(x&1073741824){return(x^3221225472^F^H)}else{return(x^1073741824^F^H)}}else{return(x^F^H)}}function r(d,F,k){return(d&F)|((~d)&k)}function q(d,F,k){return(d&k)|(F&(~k))}function p(d,F,k){return(d^F^k)}function n(d,F,k){return(F^(d|(~k)))}function u(G,F,aa,Z,k,H,I){G=K(G,K(K(r(F,aa,Z),k),I));return K(L(G,H),F)}function f(G,F,aa,Z,k,H,I){G=K(G,K(K(q(F,aa,Z),k),I));return K(L(G,H),F)}function D(G,F,aa,Z,k,H,I){G=K(G,K(K(p(F,aa,Z),k),I));return K(L(G,H),F)}function t(G,F,aa,Z,k,H,I){G=K(G,K(K(n(F,aa,Z),k),I));return K(L(G,H),F)}function e(G){var Z;var F=G.length;var x=F+8;var k=(x-(x%64))/64;var I=(k+1)*16;var aa=Array(I-1);var d=0;var H=0;while(H<F){Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=(aa[Z]|(G.charCodeAt(H)<<d));H++}Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=aa[Z]|(128<<d);aa[I-2]=F<<3;aa[I-1]=F>>>29;return aa}function B(x){var k="",F="",G,d;for(d=0;d<=3;d++){G=(x>>>(d*8))&255;F="0"+G.toString(16);k=k+F.substr(F.length-2,2)}return k}function J(k){k=k.replace(/rn/g,"n");var d="";for(var F=0;F<k.length;F++){var x=k.charCodeAt(F);if(x<128){d+=String.fromCharCode(x)}else{if((x>127)&&(x<2048)){d+=String.fromCharCode((x>>6)|192);d+=String.fromCharCode((x&63)|128)}else{d+=String.fromCharCode((x>>12)|224);d+=String.fromCharCode(((x>>6)&63)|128);d+=String.fromCharCode((x&63)|128)}}}return d}var C=Array();var P,h,E,v,g,Y,X,W,V;var S=7,Q=12,N=17,M=22;var A=5,z=9,y=14,w=20;var o=4,m=11,l=16,j=23;var U=6,T=10,R=15,O=21;s=J(s);C=e(s);Y=1732584193;X=4023233417;W=2562383102;V=271733878;for(P=0;P<C.length;P+=16){h=Y;E=X;v=W;g=V;Y=u(Y,X,W,V,C[P+0],S,3614090360);V=u(V,Y,X,W,C[P+1],Q,3905402710);W=u(W,V,Y,X,C[P+2],N,606105819);X=u(X,W,V,Y,C[P+3],M,3250441966);Y=u(Y,X,W,V,C[P+4],S,4118548399);V=u(V,Y,X,W,C[P+5],Q,1200080426);W=u(W,V,Y,X,C[P+6],N,2821735955);X=u(X,W,V,Y,C[P+7],M,4249261313);Y=u(Y,X,W,V,C[P+8],S,1770035416);V=u(V,Y,X,W,C[P+9],Q,2336552879);W=u(W,V,Y,X,C[P+10],N,4294925233);X=u(X,W,V,Y,C[P+11],M,2304563134);Y=u(Y,X,W,V,C[P+12],S,1804603682);V=u(V,Y,X,W,C[P+13],Q,4254626195);W=u(W,V,Y,X,C[P+14],N,2792965006);X=u(X,W,V,Y,C[P+15],M,1236535329);Y=f(Y,X,W,V,C[P+1],A,4129170786);V=f(V,Y,X,W,C[P+6],z,3225465664);W=f(W,V,Y,X,C[P+11],y,643717713);X=f(X,W,V,Y,C[P+0],w,3921069994);Y=f(Y,X,W,V,C[P+5],A,3593408605);V=f(V,Y,X,W,C[P+10],z,38016083);W=f(W,V,Y,X,C[P+15],y,3634488961);X=f(X,W,V,Y,C[P+4],w,3889429448);Y=f(Y,X,W,V,C[P+9],A,568446438);V=f(V,Y,X,W,C[P+14],z,3275163606);W=f(W,V,Y,X,C[P+3],y,4107603335);X=f(X,W,V,Y,C[P+8],w,1163531501);Y=f(Y,X,W,V,C[P+13],A,2850285829);V=f(V,Y,X,W,C[P+2],z,4243563512);W=f(W,V,Y,X,C[P+7],y,1735328473);X=f(X,W,V,Y,C[P+12],w,2368359562);Y=D(Y,X,W,V,C[P+5],o,4294588738);V=D(V,Y,X,W,C[P+8],m,2272392833);W=D(W,V,Y,X,C[P+11],l,1839030562);X=D(X,W,V,Y,C[P+14],j,4259657740);Y=D(Y,X,W,V,C[P+1],o,2763975236);V=D(V,Y,X,W,C[P+4],m,1272893353);W=D(W,V,Y,X,C[P+7],l,4139469664);X=D(X,W,V,Y,C[P+10],j,3200236656);Y=D(Y,X,W,V,C[P+13],o,681279174);V=D(V,Y,X,W,C[P+0],m,3936430074);W=D(W,V,Y,X,C[P+3],l,3572445317);X=D(X,W,V,Y,C[P+6],j,76029189);Y=D(Y,X,W,V,C[P+9],o,3654602809);V=D(V,Y,X,W,C[P+12],m,3873151461);W=D(W,V,Y,X,C[P+15],l,530742520);X=D(X,W,V,Y,C[P+2],j,3299628645);Y=t(Y,X,W,V,C[P+0],U,4096336452);V=t(V,Y,X,W,C[P+7],T,1126891415);W=t(W,V,Y,X,C[P+14],R,2878612391);X=t(X,W,V,Y,C[P+5],O,4237533241);Y=t(Y,X,W,V,C[P+12],U,1700485571);V=t(V,Y,X,W,C[P+3],T,2399980690);W=t(W,V,Y,X,C[P+10],R,4293915773);X=t(X,W,V,Y,C[P+1],O,2240044497);Y=t(Y,X,W,V,C[P+8],U,1873313359);V=t(V,Y,X,W,C[P+15],T,4264355552);W=t(W,V,Y,X,C[P+6],R,2734768916);X=t(X,W,V,Y,C[P+13],O,1309151649);Y=t(Y,X,W,V,C[P+4],U,4149444226);V=t(V,Y,X,W,C[P+11],T,3174756917);W=t(W,V,Y,X,C[P+2],R,718787259);X=t(X,W,V,Y,C[P+9],O,3951481745);Y=K(Y,h);X=K(X,E);W=K(W,v);V=K(V,g)}var i=B(Y)+B(X)+B(W)+B(V);return i.toLowerCase()};

