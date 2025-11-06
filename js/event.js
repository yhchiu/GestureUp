Array.prototype.contains=function (ele) {
    for (var i=0;i<this.length;i++){
        if (this[i]==ele){
            return true;
        }
	}
	return false;
}
var editMode,editDirect,browserType;
var config={};
let devMode,
	extDisable=false,
	appType={},
	extID="jialbkkmibnohldjdhbdckemnpdpngeb";

// Configuration loading state management
var configLoadState = {
	isLoading: false,
	retryCount: 0,
	maxRetries: 3,
	retryDelay: 1000,
	isInitialized: false
};
	

//check browser
if(navigator.userAgent.toLowerCase().indexOf("firefox")!=-1){
	browserType="fx";
}else if(navigator.userAgent.toLowerCase().indexOf("edge")!=-1){
	browserType="msg";
}else{
	browserType="cr";
}
if(browserType!="cr"){
	chrome=browser;
}

// Global flag to track extension context validity
var extensionContextValid = true;
var extensionContextNotificationShown = false;

// Complete configuration loading solution
function loadConfigWithRetry() {
	if (configLoadState.isLoading) {
		return; // Already loading, prevent duplicate requests
	}
	
	if (!extensionContextValid || !checkExtensionContext()) {
		console.warn("[GestureUp] Extension context invalid, cannot load config");
		return;
	}
	
	configLoadState.isLoading = true;
	
	chrome.runtime.sendMessage(extID, {type: "evt_getconf"}, function(response) {
		configLoadState.isLoading = false;
		
		// Check for runtime errors
		if (chrome.runtime.lastError) {
			handleConfigLoadError(chrome.runtime.lastError.message);
			return;
		}
		
		if (response && response.config && response.config.general) {
			// Success: config loaded properly
			config = response.config;
			devMode = response.devMode;
			sue.cons.os = response.os;
			configLoadState.retryCount = 0;
			configLoadState.isInitialized = true;
			
			console.log("[GestureUp] Config loaded successfully");
			sue.init();
		} else {
			handleConfigLoadError("Invalid or incomplete config response");
		}
	});
}

function handleConfigLoadError(errorMessage) {
	console.warn("[GestureUp] Config load error:", errorMessage);
	
	// If it's an extension context error, mark as invalid
	if (errorMessage.includes("Extension context invalidated")) {
		if (extensionContextValid) {
			extensionContextValid = false;
			showExtensionContextNotification();
		}
		return;
	}
	
	// Retry if we haven't exceeded max retries
	if (configLoadState.retryCount < configLoadState.maxRetries) {
		configLoadState.retryCount++;
		console.log(`[GestureUp] Retrying config load (${configLoadState.retryCount}/${configLoadState.maxRetries})...`);
		
		setTimeout(() => {
			loadConfigWithRetry();
		}, configLoadState.retryDelay * configLoadState.retryCount); // Exponential backoff
	} else {
		console.error("[GestureUp] Failed to load config after", configLoadState.maxRetries, "retries");
		
		// Try to use fallback config or show recovery options
		tryFallbackConfig();
	}
}

function tryFallbackConfig() {
	// Try to get cached config from localStorage
	try {
		const cachedConfig = localStorage.getItem('smartup_backup_config');
		if (cachedConfig) {
			const parsedConfig = JSON.parse(cachedConfig);
			if (parsedConfig && parsedConfig.general) {
				console.log("[GestureUp] Using cached fallback config");
				config = parsedConfig;
				sue.init();
				return;
			}
		}
	} catch (e) {
		console.warn("[GestureUp] Failed to load cached config:", e);
	}
	
	// If no fallback available, create minimal config to prevent errors
	config = {
		general: {
			fnswitch: {
				fnmges: false,
				fnrges: false,
				fnwges: false,
				fndrg: false,
				fnsdrg: false,
				fntouch: false,
				fnpop: false,
				fnicon: false,
				fnctm: false,
				fndca: false,
				fnksa: false
			},
			settings: {
				timeout: false,
				timeoutvalue: 2000,
				timeout_nomenu: false,
				minlength: 10,
				esc: true
			},
			exclusion: {
				exclusion: false,
				exclusiontype: "black"
			},
			linux: {
				cancelmenu: false
			}
		},
		mges: {
			ui: {
				direct: { enable: false },
				tip: { enable: false },
				note: { enable: false }
			}
		}
	};
	
	console.warn("[GestureUp] Using minimal fallback config - extension functionality will be limited");
	showExtensionRecoveryNotification();
}

function showExtensionRecoveryNotification() {
	if (extensionContextNotificationShown) {
		return;
	}
	extensionContextNotificationShown = true;
	
	const notification = document.createElement('div');
	notification.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: #f44336;
		color: white;
		padding: 15px 20px;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.3);
		z-index: 2147483647;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 14px;
		line-height: 1.4;
		max-width: 350px;
	`;
	
	notification.innerHTML = `
		<div style="display: flex; align-items: center; gap: 10px;">
			<div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 5px;">GestureUp Configuration Error</div>
				<div style="font-size: 13px; opacity: 0.9;">Failed to load extension settings. Please reload the page to restore full functionality.</div>
			</div>
			<div style="display: flex; gap: 8px; align-items: center;">
				<button onclick="location.reload()" style="
					background: rgba(255,255,255,0.2);
					border: 1px solid rgba(255,255,255,0.3);
					color: white;
					padding: 6px 12px;
					border-radius: 4px;
					font-size: 12px;
					cursor: pointer;
				">Reload</button>
				<button onclick="this.parentElement.parentElement.parentElement.remove()" style="
					background: none;
					border: none;
					color: white;
					font-size: 18px;
					cursor: pointer;
					opacity: 0.7;
					padding: 2px;
				">×</button>
			</div>
		</div>
	`;
	
	document.body.appendChild(notification);
}

// Save config to localStorage as backup
function backupConfigToLocal() {
	if (config && config.general) {
		try {
			localStorage.setItem('smartup_backup_config', JSON.stringify(config));
		} catch (e) {
			console.warn("[GestureUp] Failed to backup config to localStorage:", e);
		}
	}
}

// Cache i18n strings early when extension context is still valid
var cachedI18nStrings = {
    extensionUpdated: "GestureUp Extension Updated",
	extensionUpdatedDesc: "Please reload this page to restore gesture functionality", 
	reload: "Reload"
};

// Initialize i18n cache immediately
(function initI18nCache() {
	try {
		if (chrome.runtime && chrome.runtime.id && chrome.i18n) {
			cachedI18nStrings.extensionUpdated = chrome.i18n.getMessage("extension_updated") || cachedI18nStrings.extensionUpdated;
			cachedI18nStrings.extensionUpdatedDesc = chrome.i18n.getMessage("extension_updated_desc") || cachedI18nStrings.extensionUpdatedDesc;
			cachedI18nStrings.reload = chrome.i18n.getMessage("reload") || cachedI18nStrings.reload;
		}
	} catch (error) {
		console.log("[GestureUp] Failed to cache i18n strings, using fallback text");
	}
})();

// Safe wrapper for chrome.i18n.getMessage with fallback
function safeGetI18nMessage(key, fallback) {
	try {
		if (chrome.runtime && chrome.runtime.id && chrome.i18n) {
			return chrome.i18n.getMessage(key) || fallback || key;
		}
		return fallback || key;
	} catch (error) {
		return fallback || key;
	}
}

// Safely get extension ID
try {
	extID = chrome.runtime && chrome.runtime.id ? chrome.runtime.id : null;
	if (!extID) {
		extensionContextValid = false;
	}
} catch (error) {
	console.warn("[GestureUp] Cannot get extension ID:", error.message);
	extID = null;
	extensionContextValid = false;
}

// Function to show user notification when extension context is invalidated
function showExtensionContextNotification() {
	if (extensionContextNotificationShown) {
		return; // Only show once per page load
	}
	extensionContextNotificationShown = true;

	// Create notification element
	const notification = document.createElement('div');
	notification.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: #ff9800;
		color: white;
		padding: 15px 20px;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.3);
		z-index: 2147483647;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 14px;
		line-height: 1.4;
		max-width: 350px;
		animation: slideInRight 0.3s ease-out;
	`;

	// Add animation keyframes
	if (!document.getElementById('smartup-notification-style')) {
		const style = document.createElement('style');
		style.id = 'smartup-notification-style';
		style.textContent = `
			@keyframes slideInRight {
				from { transform: translateX(100%); opacity: 0; }
				to { transform: translateX(0); opacity: 1; }
			}
			@keyframes slideOutRight {
				from { transform: translateX(0); opacity: 1; }
				to { transform: translateX(100%); opacity: 0; }
			}
		`;
		document.head.appendChild(style);
	}

	// Use cached i18n strings (fetched when extension context was valid)
	const titleText = cachedI18nStrings.extensionUpdated;
	const descText = cachedI18nStrings.extensionUpdatedDesc;
	const reloadText = cachedI18nStrings.reload;

	notification.innerHTML = `
		<div style="display: flex; align-items: center; gap: 10px;">
			<div style="flex: 1;">
				<div style="font-weight: bold; margin-bottom: 5px;">${titleText}</div>
				<div style="font-size: 13px; opacity: 0.9;">${descText}</div>
			</div>
			<div style="display: flex; gap: 8px; align-items: center;">
				<button id="smartup-reload-btn" style="
					background: rgba(255,255,255,0.2);
					border: 1px solid rgba(255,255,255,0.3);
					color: white;
					padding: 6px 12px;
					border-radius: 4px;
					font-size: 12px;
					cursor: pointer;
					transition: background 0.2s;
				">${reloadText}</button>
				<button id="smartup-close-btn" style="
					background: none;
					border: none;
					color: white;
					font-size: 18px;
					cursor: pointer;
					opacity: 0.7;
					padding: 2px;
					line-height: 1;
				">×</button>
			</div>
		</div>
	`;

	document.body.appendChild(notification);

	// Add button event listeners
	const reloadBtn = notification.querySelector('#smartup-reload-btn');
	const closeBtn = notification.querySelector('#smartup-close-btn');

	reloadBtn.addEventListener('click', () => {
		location.reload();
	});

	reloadBtn.addEventListener('mouseover', () => {
		reloadBtn.style.background = 'rgba(255,255,255,0.3)';
	});

	reloadBtn.addEventListener('mouseout', () => {
		reloadBtn.style.background = 'rgba(255,255,255,0.2)';
	});

	closeBtn.addEventListener('click', () => {
		notification.style.animation = 'slideOutRight 0.3s ease-in';
		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, 300);
	});

	closeBtn.addEventListener('mouseover', () => {
		closeBtn.style.opacity = '1';
	});

	closeBtn.addEventListener('mouseout', () => {
		closeBtn.style.opacity = '0.7';
	});

	// Auto-dismiss after 10 seconds
	setTimeout(() => {
		if (notification.parentNode) {
			notification.style.animation = 'slideOutRight 0.3s ease-in';
			setTimeout(() => {
				if (notification.parentNode) {
					notification.parentNode.removeChild(notification);
				}
			}, 300);
		}
	}, 10000);
}

// Function to check and update extension context validity
function checkExtensionContext() {
	try {
		if (!chrome.runtime || !chrome.runtime.id) {
			if (extensionContextValid) {
				// Context just became invalid, show notification
				extensionContextValid = false;
				showExtensionContextNotification();
			}
			return false;
		}
		return true;
	} catch (error) {
		if (extensionContextValid) {
			// Context just became invalid, show notification
			extensionContextValid = false;
			showExtensionContextNotification();
		}
		return false;
	}
}

var sue={
	cons:{
		fix_linux_value:false,
		fix_linux_timer:null,
		os:"win",
		drginbox:true
	},
	apps:{
		enable:false,
	},
	resetConsoleLog:function(){
		if(devMode){

		}else{
			console.log=function(){return;}
		}
	},
	init:function(){
		// Don't initialize if extension context is invalid
		if (!extensionContextValid) {
			return;
		}
		
		!devMode && (console.log = () => {});

		// Add safety check for config.general before accessing it
		if (!config || !config.general) {
			console.warn("[GestureUp] Config not loaded properly, skipping initialization");
			return;
		}

		// Backup config to localStorage for future fallback use
		backupConfigToLocal();

		if (config.general.exclusion?.exclusion && sue.exclusionMatch(config.general.exclusion.exclusiontype)) {
			console.log("[GestureUp] Config not loaded properly, skipping initialization");
			return;
		}

		sue.initHandle();
		sue.uistyle={};
		sue.uistyle.mges=[];
		var _uimges=["direct","tip","note"];
		for(var i=0;i<_uimges.length;i++){
			if(config.mges.ui[_uimges[i]].enable){
				sue.uistyle.mges.push(config.mges.ui[_uimges[i]].style);
			}else{
				sue.uistyle.mges.push("none");
			}
		}
	},
	initHandle:function(){
		if(config.general.fnswitch.fntouch){
			document.addEventListener("touchstart",this.handleEvent,false);
			document.addEventListener("touchmove",this.handleEvent,false);
			document.addEventListener("touchend",this.handleEvent,false);
		}
		if(config.general.fnswitch.fnmges||config.general.fnswitch.fnrges||config.general.fnswitch.fnwges){
			console.log("[GestureUp] initHandle")
			document.addEventListener("mousedown",this.handleEvent,false);
			document.addEventListener("mouseup",this.handleEvent,false);
			document.addEventListener("mousemove",this.handleEvent,false);
			document.addEventListener("mouseover",this.handleEvent,false);
			document.addEventListener("contextmenu",this.handleEvent,false);
		}
		if(config.general.fnswitch.fndrg||config.general.fnswitch.fnsdrg){
			window.addEventListener("dragstart",this.handleEvent,false);
			window.addEventListener("drag", this.handleEvent,false);
			window.addEventListener("dragover",this.handleEvent,false);
			window.addEventListener("dragend",this.handleEvent,false);
		}
		if(config.general.settings.esc){
			window.addEventListener("keydown",this.handleEvent,false);
		}
		if(config.general.fnswitch.fnrges||config.drg.settings.clickcancel){
			document.addEventListener("click",this.handleEvent,false);
		}
		if(config.general.fnswitch.fnwges){
			window.addEventListener("wheel",this.handleEvent,false);
		}
		if(config.general.fnswitch.fndca){
			window.addEventListener("dblclick",this.handleEvent,false);
		}
	},
	initHandle2:function(){
		sue.document.addEventListener("mousemove",this.handleEvent,false);
		sue.document.addEventListener("mouseover",this.handleEvent,false);
		sue.document.addEventListener("contextmenu",this.handleEvent,false);
	},
	handleEvent:function(e){
		// Don't handle events if extension context is invalid
		if (!extensionContextValid) {
			return;
		}
		
		switch(e.type){
			case"touchstart":
				if(!config.general.fnswitch.fntouch){return;}
				if(e.touches.length!=1){
					sue.drawing?sue.clearUI():null;
					break;
				}else{
					sue.lineDrawReady_touch(e,"touch");
				}
				break;
			case"touchmove":
				if(sue.drawing&&e.touches.length==1){
					sue.touchMove(e);
				}else{
					sue.clearUI();
				}
				break;
			case"touchend":
				sue.touchEnd(e);
				break;
			case"wheel":
				if(!extDisable&&config.general.fnswitch.fnwges&&(e.buttons==1||e.buttons==2)){
					sue.inWges=true;
					sue.clearUI();//clear mouse gesture
					var sendValue={
						button:e.button,
						buttons:e.buttons,
						wheelDelta:e.deltaY
					}

					// Check extension context before sending message
					if (extensionContextValid && checkExtensionContext()) {
						try {
					chrome.runtime.sendMessage(extID,{type:"action_wges",sendValue:sendValue,selEle:sue.selEle})
						} catch (error) {
							if (extensionContextValid) {
								extensionContextValid = false;
								showExtensionContextNotification();
							}
						}
					}
					// e.preventDefault();
				}
				break;
			case"click":
				if(sue.inRges){
					e.preventDefault();
					if(browserType=="fx"&&e.button==2){
						sue.inRges=true;//fix firefox, it is click before contextmenu
					}else{
						sue.inRges=false;
					}
				}
				if(sue.inWges){
					e.preventDefault();
					if(browserType=="fx"&&e.button==2){
						sue.inWges=true;
					}else{
						sue.inWges=false;//fix firefox, it is click before contextmenu
					}
				}
				if(sue.inDrg&&config.drg.settings.clickcancel){console.log("[GestureUp] cancel");sue.break=true;sue.stopMges(e);}
				break;
			case"keydown":
				// console.log(e.keyCode);
				if(!editMode&&config.general.fnswitch.fnksa){
					sue.ksa.action(e);
				}
				if(e.keyCode==27){
					sue.break=true;
					sue.stopMges(e);
				}
				break;
			case"mousedown":
				if(!extDisable
					&&config.general.fnswitch.fnmges
					&&e.buttons==config.mges.settings.model
					&&!e[config.mges.settings.holdkey+"Key"]){
						sue.lineDrawReady(e,"mges");
				}
				
				// Enhanced rocker gesture handling - trigger action on second button down
				if(!extDisable && config.general.fnswitch.fnrges){
					console.log("[GestureUp] rges mousedown",e.buttons, e.button);
					
					// Check if this is a rocker gesture situation
					if((e.buttons == 3) && (e.button == 0 || e.button == 2)) {
						// Both left and right buttons are now pressed
						sue.inRges = true;
						
						// Determine the gesture type based on which button was pressed second
						let rgesType;
						if(e.button == 2) {
							// Right button pressed while left was held (buttons=3, new button=2)
							rgesType = 0; // Left->Right gesture
						} else if(e.button == 0) {
							// Left button pressed while right was held (buttons=3, new button=0)  
							rgesType = 1; // Right->Left gesture
						}
						
						if(rgesType !== undefined) {
							var sendValue = {
								buttons: e.buttons,
								gestureType: rgesType
							}
						// Capture selection and target details for rocker gestures
						sue.selEle = {};
						sue.selEle.txt = window.getSelection().toString();
						sue.selEle.lnk = e.href || (e.target && e.target.href) || null;
						sue.selEle.img = (e.target && e.target.src) || null;
						sue.selEle.str = (e.target && e.target.innerText) || "";
						// Also find closest anchor if clicking inside nested elements
						try {
							const closestLink = e?.target?.closest ? e.target.closest('a') : null;
							if (closestLink) {
								sue.selEle.lnk = sue.selEle.lnk || closestLink.href;
								sue.selEle.objLnk = { href: closestLink.href, innerText: closestLink.innerText };
							}
						} catch (err) {}
						sue.startEle = e.target;
							
							// Trigger the rocker gesture action immediately
							if (extensionContextValid && checkExtensionContext()) {
								try {
							chrome.runtime.sendMessage(extID,{type:"action_rges",sendValue:sendValue,selEle:sue.selEle},function(response){
										if (chrome.runtime.lastError) {
											if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
												if (extensionContextValid) {
													extensionContextValid = false;
													showExtensionContextNotification();
												}
												return;
											}
											console.warn("[GestureUp] Runtime error in rges:", chrome.runtime.lastError.message);
										}
									})
								} catch (error) {
									if (extensionContextValid) {
										extensionContextValid = false;
										showExtensionContextNotification();
									}
								}
							}
						}
					} else {
						// Store the first button for potential rocker gesture
						sue.cons.rges_btn = e.button;
					}
				}
				break;
			case"mouseup":
				if((e.button==1&&config.mges.settings.model==4)
					||(e.button==2&&e.button==config.mges.settings.model&&(config.general.linux.cancelmenu&&sue.cons.os!="win"))){
					if(sue._dirArray&&sue.drawing){
						sue.stopMges(e);
					}
					sue.clearUI();
					sue.drawing=false;
					sue._lastX=e.clientX;
					sue._lastY=e.clientY;
				}
				// Reset rocker gesture state when buttons are released
				if(!extDisable && config.general.fnswitch.fnrges && sue.inRges) {
					// Reset the rocker gesture state when one of the buttons is released
					if(e.button == 0 || e.button == 2) {
						console.log("[GestureUp] rges mouseup reset", e.button);
						// Keep inRges true briefly to prevent context menu, then reset
						window.setTimeout(function() {
							sue.inRges = false;
						}, 50);
					}
				}
				break;
			case"contextmenu":
				if(config.general.linux.cancelmenu
					&&sue.cons.os!="win"){
						//fix mges
						if(config.general.fnswitch.fnmges&&!sue.cons.fix_linux_value&&config.mges.settings.model==2){
							e.preventDefault();
						}

						//fix rges
						if(config.general.fnswitch.fnrges&&!sue.cons.fix_linux_value&&config.rges.actions[1].name!="none"){
							e.preventDefault();
						}

						//fix wges
						if(config.general.fnswitch.fnwges&&!sue.cons.fix_linux_value&&!(config.wges.actions[2].name=="none"&&config.wges.settings[3].name=="none")){
							e.preventDefault();
						}

						sue.cons.fix_linux_value=true;
						window.clearTimeout(sue.cons.fix_linux_timer);
						sue.cons.fix_linux_timer=window.setTimeout(function(){sue.cons.fix_linux_value=false;},500)
						break;
				}else{//all for win
					if(sue._dirArray&&sue.drawing){
						sue.stopMges(e);
					}
					if(sue.drawing&&config.mges.settings.model==2){
						//e.preventDefault();
						sue.clearUI();
						sue.drawing=false;
						sue._lastX=e.clientX;
						sue._lastY=e.clientY;					
					}

					//fix wges
					if(sue.inWges){
						sue.inWges=false;
						e.preventDefault();
					}
					//fix rges
					if(sue.inRges){
						sue.inRges=false;
						e.preventDefault();
					}
					//e.preventDefault();
				}
				//none popup menu by timeout
				if(config.general.settings.timeout_nomenu&&sue.timeout_nomenu){
					sue.timeout_nomenu=false;
					e.preventDefault();
				}
				//fix switchtab by rges or wges
				if(sue.cons.switchtab&&sue.cons.switchtab.contextmenu){
					e.preventDefault();
					sue.cons.switchtab.contextmenu=false;
				}
				// fix context menu selected elements
				sue.selEle={};
				sue.selEle.txt=window.getSelection().toString();
				sue.selEle.lnk=document.activeElement.href;
				sue.selEle.img=document.activeElement.src;
				sue.selEle.str=document.activeElement.text;
				// sue.startEle=e.target;
				
				break;
			case"mousemove":
				if(sue.drawing&&e.buttons==config.mges.settings.model){
					sue.lineDraw(e);
				}
				break;
			case"dragstart":
				if(!extDisable
					&&((config.general.fnswitch.fndrg&&!e[config.drg.settings.holdkey+"Key"])
										||(config.general.fnswitch.fnsdrg&&!e[config.sdrg.settings.holdkey+"Key"]))){
					sue.lineDrawReady(e,config.general.fnswitch.fndrg?"drg":"sdrg");
					
					sue.inDrg=true;
				}
				break;
			case"dragover":
				if(sue.drawing){
					sue.lineDraw(e,sue.drawType[0]);
					if(sue.drawType[0]=="drg"&&config[sue.drawType[0]].ui.tip.type=="follow"){
						sue.uiPos(e);
					}
					if(config[sue.drawType[0]].settings.drgcursor){
						e.dataTransfer.effectAllowed="move"
						e.dataTransfer.dropEffect="move";
						e.preventDefault();						
					}
					//drag to text box, cancel
					if(!sue.cons.drginbox&&config[sue.drawType[0]].settings.drgtobox&&e.target&&e.target.type&&(e.target.type=="textarea"||e.target.type=="text")){
						sue.break=true;
						sue.stopMges(e);
					}
				}
				break;
			case"dragend":
				if(sue._dirArray&&sue.drawing){
					sue.stopMges(e);
				}
				sue.drawing=false;
				sue._lastX=e.clientX;
				sue._lastY=e.clientY;
				sue.inDrg=false;
				break;
			case"dblclick":
				console.log("[GestureUp] dblclick");
				if(!editMode){
					if(!config.dca.settings.box&&(e.target.tagName&&((e.target.tagName.toLowerCase()=="input"&&e.target.type=="text")||e.target.tagName.toLowerCase()=="textarea"))){
						console.log("[GestureUp] dblclick")
						break;
					}
					if(config.dca.settings.confirm&&!window.confirm(safeGetI18nMessage("dca_confirmmessage", "Confirm action"))){
						break;
					}
					if(config.dca.settings.selnothing&&window.getSelection().toString().trim()!=""){
						break;
					}
					//cancel dca when on some elements: select, radio, button,
					if(e.target.tagName.toLowerCase()=="select"
						||e.target.tagName.toLowerCase()=="button"
						||(e.target.tagName.toLowerCase()=="input"&&e.target.type=="text")
						||(e.target.tagName.toLowerCase()=="input"&&e.target.type=="checkbox")
						||(e.target.tagName.toLowerCase()=="input"&&e.target.type=="radio")
						||(e.target.tagName.toLowerCase()=="input"&&e.target.type=="range")
						||(e.target.tagName.toLowerCase()=="input"&&e.target.type=="color")
						){
						break;
					}
					// Check extension context before sending message
					if (extensionContextValid && checkExtensionContext()) {
						try {
					chrome.runtime.sendMessage(extID,{type:"action_dca",sendValue:sendValue,selEle:sue.selEle});
						} catch (error) {
							if (extensionContextValid) {
								extensionContextValid = false;
								showExtensionContextNotification();
							}
						}
					}
				}	
				break;
		}
	},
	exclusionMatch:(type)=>{
		const patterns = config.general.exclusion[type];
		const url = `${window.location.host}${window.location.pathname.replace(/\/$/, "")}`;
		const regexes = patterns.map(pattern => new RegExp('^' + pattern.replace(/\*/g, '.*') + '$'));
		console.log("[GestureUp] regexes", regexes);
		const exclusion= regexes.some(regex => regex.test(url));
		return type === "black" ? exclusion : !exclusion;
	},
	ksa:{
		timeout:null,
		keyArray:[],
		action:function(e){
			if(e.target.tagName.toLowerCase()=="input"
				||e.target.tagName.toLowerCase()=="textarea"
				||e.keyCode==16
				||e.keyCode==17
				||e.keyCode==18){
					return
			}
			sue.ksa.keyArray.push(e.keyCode)	
			var key={
				alt:e.altKey,
				shift:e.shiftKey,
				ctrl:e.ctrlKey,
				codes:sue.ksa.keyArray
			}
			for(var i=0;i<config.ksa.actions.length;i++){
				if(key.ctrl==config.ksa.actions[i].ctrl
					&&key.alt==config.ksa.actions[i].alt
					&&key.shift==config.ksa.actions[i].shift
					&&key.codes.toString()==config.ksa.actions[i].codes.toString()){
						var selEle={txt:window.getSelection().toString()}
						// Check extension context before sending message
						if (extensionContextValid && checkExtensionContext()) {
							try {
								chrome.runtime.sendMessage(extID,{type:"action_ksa",selEle:selEle,id:i},function(response){
									if (chrome.runtime.lastError) {
										if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
											if (extensionContextValid) {
												extensionContextValid = false;
												showExtensionContextNotification();
											}
											return;
										}
										console.warn("[GestureUp] Runtime error in ksa:", chrome.runtime.lastError.message);
									}
								})
							} catch (error) {
								if (extensionContextValid) {
									extensionContextValid = false;
									showExtensionContextNotification();
								}
							}
						}
						break;
				}
			}
			// window.clearTimeout(sue.ksa.timeout);
			sue.ksa.timeout=window.setTimeout(function(){
				sue.ksa.keyArray=[];
			},config.ksa.settings.timeout)
		}
	},
	domCreate:function(edom,eele,einner,ecss,edata,etxt){
		var dom=document.createElement(edom);
		if(eele){
			for (var i = 0;i<eele.setName.length; i++) {
				if(eele.setName[i]=="for"){
					dom.setAttribute(eele.setName[i],eele.setValue[i]);
				}else if(eele.setName[i]=="checked"){
					eele.setValue[i]?dom.setAttribute(eele.setName[i],"checked"):null;
				}else{
					dom[eele.setName[i]]=eele.setValue[i];
				}
			}
		}
		if(einner){}
		if(ecss){
			dom.style.cssText+=ecss;
		}
		if(edata){
			for (var i = 0;i<edata.setName.length; i++) {
				dom.dataset[edata.setName[i]]=edata.setValue[i];
			}
		}
		if(etxt){
			dom.innerText=etxt;
		}
		return dom;
	},
	regURL:function(txt){
		var reg=/^((http|https|ftp):\/\/)?(\w(\:\w)?@)?([0-9a-z_-]+\.)*?([a-z0-9-]+\.[a-z]{2,6}(\.[a-z]{2})?(\:[0-9]{2,6})?)((\/[^?#<>\/\\*":]*)+(\?[^#]*)?(#.*)?)?$/i; 
		return reg.test(txt.trim());
	},
	lineDrawReady_touch:function(e,type){
		e=e.targetTouches?e.targetTouches[0]:e;

		sue._lastX=e.clientX;
		sue._lastY=e.clientY;
		sue._startX=e.clientX;
		sue._startY=e.clientY;
		sue._dirArray="";
		sue.drawing=true;

		sue.selEle={};
		sue.selEle.txt=window.getSelection().toString();
		// fix firefox get selection frome textbox
		if(browserType=="fx"){
			if(e.target.tagName.toLowerCase=="textarea"||(e.target.tagName.toLowerCase=="input"&&e.target.type=="text")){
				sue.selEle.txt=e.target.value.substring(e.target.selectionStart,e.target.selectionEnd);
			}
		}
		sue.selEle.lnk=e.href||e.target.href;
		sue.selEle.img=sue.selEle.img?sue.selEle.img:e.target.src;
		sue.selEle.str=e.target.innerText;
		sue.startEle=e.target;

		//txt to url
		if(config[type].settings.txttourl&&sue.regURL(sue.selEle.txt)){
			sue.selEle.lnk=sue.selEle.txt;
		}


		sue.window=window;
		sue.document=window.document.documentElement;
		sue.drawType=["touch","actions"];
		var _uiarray=["direct","tip","note","allaction"];
		var _uiset=[];
		for(var i=0;i<_uiarray.length;i++){
			if(config[sue.drawType[0]].ui&&config[sue.drawType[0]].ui[_uiarray[i]].enable){
				sue.UI(config[sue.drawType[0]].ui[_uiarray[i]].style);
			}
		}
	},
	touchMove:function(e){
		var x=e.targetTouches[0].clientX;
		var y=e.targetTouches[0].clientY;
		var dx=Math.abs(x-sue._lastX);
		var dy=Math.abs(y-sue._lastY);
		var dz=Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
		if(dz<1){return}
		sue.uiPos(e);
		(config[sue.drawType[0]].ui.line.enable||editMode)?sue.ui_line(e):null;
		if(dx<config.general.settings.minlength
			&&dy<config.general.settings.minlength){
			return;
		}

		var dir;
		dir=dx>dy?(x<sue._lastX?"L":"R"):(y<sue._lastY?"U":"D"); 	

		var lastDir=sue._dirArray.substr(sue._dirArray.length-1,1);
		if(dir!=lastDir){
			sue._dirArray+=dir;
			//show direct
			sue.drawType[0]!="sdrg"&&config[sue.drawType[0]].ui.direct.enable?sue.ui_direct(e):null;
			//get tip
			(config[sue.drawType[0]].ui.tip.enable||config[sue.drawType[0]].ui.note.enable)?sue.sendDir(sue._dirArray,"gettip",e):null;
		}
		//timeout
		if(config.general.settings.timeout){
			if(sue.timeout){window.clearTimeout(sue.timeout);sue.break=false;}
			sue.timeout=window.setTimeout(function(){
				sue.break=true;
				sue.clearUI();
			},config.general.settings.timeoutvalue)
		}
		sue._lastX=e.targetTouches[0].clientX;
		sue._lastY=e.targetTouches[0].clientY;
	},
	touchEnd:function(e){
		if(!sue._dirArray){return;}
		if(sue.break){
			sue.clearUI();
			sue.break=false;
			return;
		}
		sue.clearUI();
		if(editMode){
			editDirect=sue._dirArray;
			var getele=function(ele){
				if(ele.tagName.toLowerCase()=="smartup"&&ele.classList.contains("su_apps")){
					return ele;
				}else{
					return getele(ele.parentNode);
				}
			}
			var boxOBJ=getele(document.querySelector(".su_app_test"));
			boxOBJ.querySelector(".testbox").innerText=sue._dirArray;
		}else{
			sue.sendDir(sue._dirArray,"action",e);
		}	
		sue.drawing=false;
		if(sue.timeout){window.clearTimeout(sue.timeout);sue.break=false;}
		sue._dirArray="";
	},
	lineDrawReady:function(e,type){
		console.log("[GestureUp] lineDrawReady");
		console.log("[GestureUp] e.target",e.target)
		//disable drag ,when draggable=true
		if(config[type].settings.draggable&&e.target.getAttribute&&(e.target.getAttribute("draggable")=="true")){return;}
		sue._lastX=e.clientX;
		sue._lastY=e.clientY;
		sue._startX=e.clientX;
		sue._startY=e.clientY;
		sue._dirArray="";
		sue.drawing=true;
		sue.cons.drginbox=false;//drag to box

		//timeout
		if(config.general.settings.timeout){
			if(sue.timeout){window.clearTimeout(sue.timeout);sue.break=false;}
			sue.timeout=window.setTimeout(function(){
				sue.break=true;
				sue.clearUI();
			},config.general.settings.timeoutvalue)
		}

		sue.selEle={};
		if(type=="drg"||type=="sdrg"){
			switch(e.target.nodeType){
				case 3:
					sue.drawType=[type,"t"+type];
					break;
				case 1:
					if(e.target.src){
						sue.drawType=[type,"i"+type];
						sue.selEle.img=e.target.src;
					}else if(e.target.href){
						if(config[type].settings.drgimg&&e.target.firstElementChild&&e.target.firstElementChild.nodeType==1&&e.target.firstElementChild.src){
							sue.drawType=[type,"i"+type];
							sue.selEle.img=e.target.firstElementChild.src;
						}else{
							sue.drawType=[type,"l"+type];
						}
					}else{
						sue.drawType=[type,"t"+type];
					}
					break;
			}
			//enable drag in text box
			if(!config[type].settings.drgbox){
				if(e.button==0&&e.target.tagName&&((e.target.tagName.toLowerCase()=="input"&&e.target.type=="text")||e.target.tagName.toLowerCase()=="textarea")){
					sue.drawing=false;
				}
			}else{
				if(e.button==0&&e.target.tagName&&((e.target.tagName.toLowerCase()=="input"&&e.target.type=="text")||e.target.tagName.toLowerCase()=="textarea")){
					sue.cons.drginbox=true;
				}
			}
		}else if(type=="mges"){
			sue.drawType=["mges","actions"];
		}

		//sue.selEle={};
		sue.selEle.txt=window.getSelection().toString();
		// fix firefox get selection frome textbox
		if(browserType=="fx"){
			if(e.target&&e.target.tagName&&(e.target.tagName.toLowerCase()=="textarea"||(e.target.tagName.toLowerCase()=="input"&&e.target.type.toLowerCase()=="text"))){
				sue.selEle.txt=e.target.value.substring(e.target.selectionStart,e.target.selectionEnd);
			}
		}
		console.log("[GestureUp] e.target",e.target);
		sue.selEle.lnk=e.href||e.target.href;
		sue.selEle.img=sue.selEle.img?sue.selEle.img:e.target.src;
		sue.selEle.str=e.target.innerText;
		sue.startEle=e.target;

		// get link obj
		const link = e?.target?.closest?.('a');
		link && (sue.selEle.objLnk = {href: link.href, innerText: link.innerText});

		//txt to url for mges
		if(type=="mges"&&config.mges.settings.txttourl&&sue.regURL(sue.selEle.txt)){
			sue.selEle.lnk=sue.selEle.txt;
		}

		//txt to url for drag
		if(type!="mges"&&((config.general.fnswitch.fnsdrg&&config.sdrg.settings.drgurl)||(config.general.fnswitch.fndrg&&config.drg.settings.drgurl))){
			if(sue.regURL(sue.selEle.txt)){
				sue.drawType=[type,"l"+type];
				sue.selEle.lnk=sue.selEle.txt;
			}
		}

		var ele=e.target;
		var getParent=function(win){
			console.log("[GestureUp] win", win);
			if(win.parent&&win.parent!=win){
				return arguments.callee(win.parent);
			}else{
				return win
			}
		}
		sue.window=window;
		sue.document=document.documentElement;
		sue.initHandle2();

		//drag fn switch
		if(sue.drawType[1]==("t"+type)&&!config[type].settings.txt){
			sue.drawing=false;
		}
		if(sue.drawType[1]==("l"+type)&&!config[type].settings.lnk){
			sue.drawing=false;
		}
		if(sue.drawType[1]==("i"+type)&&!config[type].settings.img){
			sue.drawing=false;
		}

		//sue.clearUI();
		var _uiarray=["direct","tip","note","allaction"];
		var _uiset=[];
		for(var i=0;i<_uiarray.length;i++){
			if(config[sue.drawType[0]].ui&&config[sue.drawType[0]].ui[_uiarray[i]].enable){
				sue.UI(config[sue.drawType[0]].ui[_uiarray[i]].style);
			}
		}
		return
	},
	lineDraw:function(e,type){
		var x=e.clientX;
		var y=e.clientY;
		var dx=Math.abs(x-sue._lastX);
		var dy=Math.abs(y-sue._lastY);
		var dz=Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));

		if(dz<1){return}
		sue.uiPos(e)
		sue.drawType[0]!="sdrg"&&(config[sue.drawType[0]].ui.line.enable||editMode)?sue.ui_line(e):null;
		if(dx<config.general.settings.minlength
			&&dy<config.general.settings.minlength){
			return;
		}

        var dir;
		if(sue.drawType[0]=="sdrg"){
			var angle=180/(Math.PI/Math.acos(dy/dz));

			if(angle<=22.5&&dx<dy&&y<sue._lastY){
				dir="U"
			}else if(angle<=22.5&&dx<dy&&y>sue._lastY){
				dir="D"
			}else if(angle>67.5&&angle<=90&&dx>dy&&x>sue._lastX){
				dir="R"
			}else if(angle>67.5&&angle<=90&&dx>dy&&x<sue._lastX){
				dir="L"
			}else if(angle>22.5&&angle<=67.5&&y<sue._lastY&&x<sue._lastX){
				dir="l"
			}else if(angle>22.5&&angle<=67.5&&y<sue._lastY&&x>sue._lastX){
				dir="u"
			}else if(angle>22.5&&angle<=67.5&&y>sue._lastY&&x>sue._lastX){
				dir="r"
			}else if(angle>22.5&&angle<=67.5&&y>sue._lastY&&x<sue._lastX){
				dir="d"
			}
		}else{
			dir=dx>dy?(x<sue._lastX?"L":"R"):(y<sue._lastY?"U":"D");    	
		}

		var lastDir=sue._dirArray.substr(sue._dirArray.length-1,1);
        if(dir!=lastDir){
			sue._dirArray+=dir;
			//show direct
            // For Simple Drag, allow UI direct according to its own config
            (config[sue.drawType[0]].ui&&config[sue.drawType[0]].ui.direct&&config[sue.drawType[0]].ui.direct.enable)?sue.ui_direct(e):null;
			//get tip
            // Allow tip display for Simple Drag as well
            ((config[sue.drawType[0]].ui&&config[sue.drawType[0]].ui.tip&&config[sue.drawType[0]].ui.tip.enable)||
             (config[sue.drawType[0]].ui&&config[sue.drawType[0]].ui.note&&config[sue.drawType[0]].ui.note.enable))
             ?sue.sendDir(sue._dirArray,"gettip",e):null;
		}
		//timeout
		if(config.general.settings.timeout){
			if(sue.timeout){window.clearTimeout(sue.timeout);sue.break=false;}
			sue.timeout=window.setTimeout(function(){
				sue.break=true;
				sue.clearUI();
				sue.timeout_nomenu=true;
			},config.general.settings.timeoutvalue)
		}
		sue._lastX=e.clientX;
		sue._lastY=e.clientY;
	},
	UI:function(style){
		console.log("[GestureUp] style", style)
		var domui=sue.document.querySelector("div[data-suui=uibox][data-sustyle="+style+"]");
		if(!domui){
			domui=document.createElement("div");
			domui.dataset.suui="uibox";
			domui.dataset.sustyle=style;
			domui.style.cssText+=
				"position:fixed;text-align:right;"
				+"z-index:"+parseInt((new Date())/1000);
			let objStyle={
				"leftbottom":"left:0;bottom:0px;",
				"lefttop":"left:0;top:0px;",
				"righttop":"right:0;top:0px;",
				"hover":"right:0px;bottom:0;",
				"top":"top:0;",
				"ui_bottom":"bottom:0"
			}
			domui.style.cssText+=objStyle[style];
			sue.document.appendChild(domui)
		}
	},
	ui_line:function(e){
		if(!sue.document.querySelector("div[data-suui=line]")){
			var svgdiv=this.svgdiv= document.createElement("div");
				svgdiv.dataset.suui="line";
				svgdiv.style.cssText+="position:fixed;left:0;top:0;display:block;background:transparent;border:none;"+
					"width:"+sue.window.innerWidth+"px;"+
					"height:"+sue.window.innerHeight+"px;"+
					"z-index:"+parseInt((new Date().getTime())/1000);
			var SVG = 'http://www.w3.org/2000/svg';
			var svgtag= sue.svgtag= document.createElementNS(SVG, "svg");
				svgtag.style.cssText+="width:"+sue.window.innerWidth+"px;"+"height:"+sue.window.innerHeight+"px;";
			var polyline = document.createElementNS(SVG, 'polyline');
				polyline.style.stroke=config[sue.drawType[0]].ui.line.color;
				polyline.style.strokeOpacity=config[sue.drawType[0]].ui.line.opacity/100;
				polyline.style.strokeWidth=config[sue.drawType[0]].ui.line.width;
				polyline.style.fill="none";
				this.polyline = polyline;
				
			svgtag.appendChild(polyline);
			svgdiv.appendChild(svgtag);
			sue.document.appendChild(svgdiv);
		}
		e=e.targetTouches?e.targetTouches[0]:e;
		this.startX = e.clientX;
		this.startY = e.clientY;
		if(sue.svgtag){
			var p =sue.svgtag.createSVGPoint();
			p.x = this.startX;
			p.y = this.startY;
			this.polyline.points.appendItem(p);
		}else{
			return
		}
	},
	ui_direct:function(e){
		if(!config[sue.drawType[0]].ui.direct.enable){return;}
		var uidom=sue.document.querySelector("div[data-suui=uibox][data-sustyle="+config[sue.drawType[0]].ui.direct.style+"]");
		var ui_dir=uidom.querySelector("div[data-suui=dir]");
		if(ui_dir){
			var _img=document.createElement("img");
				_img.src=chrome.runtime.getURL("")+"image/"+"direct.png";
				_img.style.cssText+="float:left;"
					+"height:"+config[sue.drawType[0]].ui.direct.width+"px;"
					+"transform:rotate(+"+sue.directimg(sue._dirArray[sue._dirArray.length-1])+");";
			ui_dir.appendChild(_img);
		}else{
			ui_dir=document.createElement("div");
			ui_dir.dataset.suui="dir";
			ui_dir.style.cssText+=
				"display:inline-block;text-align:center;border-radius:2px;padding:0 5px;"+
				"background-color:"+config[sue.drawType[0]].ui.direct.color+" !important;"+
				"opacity:"+config[sue.drawType[0]].ui.direct.opacity/100;
			ui_dir.appendChild(sue.domDir2(sue._dirArray[sue._dirArray.length-1]));
			uidom.appendChild(ui_dir);

			var _br=document.createElement("br");
				_br.style.cssText+="/*display:none;*/";
			uidom.appendChild(_br);
		}
	},
	ui_tip:function(confOBJ,e){
		if(!config[sue.drawType[0]].ui.tip.enable){return;}
		var uidom=sue.document.querySelector("div[data-suui=uibox][data-sustyle="+config[sue.drawType[0]].ui.tip.style+"]");
		if(!uidom){return}
		var _dom=uidom?uidom.querySelector("div[data-suui=tip]"):null;
		if(!_dom){
			var _dom=document.createElement("div");
				_dom.dataset.suui="tip";
				_dom.style.cssText+="display:inline-block;padding:2px 5px 2px 5px;border-radius: 3px;font-family: arial,sans-serif !important;"
					+"background-color:"+config[sue.drawType[0]].ui.tip.bgcolor+";"
					+"color:"+config[sue.drawType[0]].ui.tip.color+";"
					+"font-size:"+config[sue.drawType[0]].ui.tip.width+"px;"
					+"opacity:"+config[sue.drawType[0]].ui.tip.opacity/100+";"
			uidom.appendChild(_dom);
			var _br=document.createElement("br");
				_br.style.cssText+="/*display:none;*/";
			uidom.appendChild(_br);
		}
		_dom.textContent="";
		if(confOBJ.tip){
			if(config[sue.drawType[0]].ui.tip.withdir){
				var _dir="";
				for(var i=0;i<sue._dirArray.length;i++){
					var _dir=sue.domCreate("img",{setName:["src"],setValue:[chrome.runtime.getURL("")+"image/direct.png"]},null,"vertical-align: text-top;transform:rotate(+"+sue.directimg(sue._dirArray[i])+");height: "+config[sue.drawType[0]].ui.tip.width+"px;");
					_dom.appendChild(_dir);
				}
			}
			var _spanTip=sue.domCreate("span",null,null,null,null,confOBJ.tip);
			_dom.appendChild(_spanTip);
			_dom.style.cssText+="display:inline-block;";
		}else{
			_dom.style.cssText+="display:none;";
		}
	},
	ui_note:function(confOBJ,e){
		if(!config[sue.drawType[0]].ui.note.enable){return;}
		var uidom=sue.document.querySelector("div[data-suui=uibox][data-sustyle="+config[sue.drawType[0]].ui.note.style+"]");
		var _dom=uidom.querySelector("div[data-suui=note]");
		if(!_dom){
		    _dom=document.createElement("div");
			_dom.dataset.suui="note";
			_dom.style.cssText+="font-family: arial,sans-serif !important;font-style: italic;/*position:fixed;*/"+
			"color:"+config[sue.drawType[0]].ui.note.color+";"+
			"font-size:"+config[sue.drawType[0]].ui.note.width+"px;"+
			"opacity:"+config[sue.drawType[0]].ui.note.opacity/100+";"
			uidom.appendChild(_dom);
			var _br=document.createElement("br");
			uidom.appendChild(_br);
		}
		if(confOBJ.note&&confOBJ.note.type&&confOBJ.note.value){
			_dom.style.cssText+="display:inline-block;";
			_dom.innerText=confOBJ.note.value;
		}else{
			_dom.style.cssText+="display:none;";
			_dom.innerText="";
			return;
		}
	},
	ui_allaction:function(confOBJ,e){
		if(!config[sue.drawType[0]].ui.allaction.enable){return;}
		var uidom=sue.document.querySelector("div[data-suui=uibox][data-sustyle="+config[sue.drawType[0]].ui.allaction.style+"]");
			
		var _dom=uidom.querySelector("div[data-suui=allaction]");
		if(!_dom){
		    _dom=document.createElement("div");
			_dom.dataset.suui="allaction";
			_dom.style.cssText+="font-family: arial,sans-serif !important;text-align:left;padding: 5px 20px;border-radius: 2px;"
				+"color:"+config[sue.drawType[0]].ui.allaction.color+";"
				+"background-color:"+config[sue.drawType[0]].ui.allaction.bgcolor+";"
				+"font-size:"+config[sue.drawType[0]].ui.allaction.width+"px;"
				+"opacity:"+config[sue.drawType[0]].ui.allaction.opacity/100+";white-space:nowrap;"
			uidom.appendChild(_dom);
		}
		_dom.textContent="";
		if(confOBJ.allaction&&confOBJ.allaction.length>0){
			for(var i=0;i<confOBJ.allaction.length;i++){
				var _allAction=sue.domCreate("div",null,null,"white-space:nowrap;line-height:"+(config[sue.drawType[0]].ui.allaction.width*1.35)+"px;");
				for(var ii=0;ii<confOBJ.allaction[i].direct.length;ii++){
					var _img=sue.domCreate("img",{setName:["src"],setValue:[chrome.runtime.getURL("")+"image/direct.png"]},null,"display:inline-block !important;vertical-align:middle;height:"+config[sue.drawType[0]].ui.allaction.width+"px;width:auto !important;transform:rotate("+sue.directimg(confOBJ.allaction[i].direct[ii])+");margin-right:2px;");
					_allAction.appendChild(_img);
				}
				_allAction.appendChild(sue.domCreate("span",null,null,"display:inline-block;vertical-align:middle;margin-left:6px;",null,"  "+confOBJ.allaction[i].tip));
				_dom.appendChild(_allAction);
			}
			_dom.style.cssText+="display:inline-block;";
		}else{
			_dom.style.cssText+="display:none;";
		}
	},
	directimg:function(direct){
		var myDeg={L:"0deg",U:"90deg",R:"180deg",D:"270deg"};
		return myDeg[direct];
	},
	domDir2:function(img){
		var domimg=document.createElement("img");
			domimg.src=chrome.runtime.getURL("")+"image/"+"direct.png";
			domimg.style.cssText+="float:left;"
				+"height:"+config[sue.drawType[0]].ui.direct.width+"px;"
				+"vertical-align: text-top;"
				+"transform:rotate(+"+sue.directimg(img)+");";
		return domimg;
	},
	domDir:function(value){
		if(config[sue.drawType[0]].ui.tip.withdir){
			var domdir="";
			for(var i=0;i<sue._dirArray.length;i++){
				domdir+="<img src='"+chrome.runtime.getURL("")+"image/"+"direct.png"+"' style='/*float:left;display:block;margin-top:5px;*/"
					+"vertical-align: text-top;"
					+"transform:rotate(+"+sue.directimg(sue._dirArray[i])+");"
					+"height: "+config[sue.drawType[0]].ui.tip.width+"px;"
					+"'>"
			}
			return domdir;		
		}else{
			return "";
		}
	},
	uiPos:function(e){
		let domUIs=sue.document.querySelectorAll("div[data-suui=uibox]"),
			i=0,domWidth,domHeight;
		e=e.targetTouches?e.targetTouches[0]:e;
		for(i=0;i<domUIs.length;i++){
			if(["center","top","ui_bottom","left","right"].contains(domUIs[i].dataset.sustyle)){
				domWidth=window.getComputedStyle(domUIs[i]).width;
				domWidth=domWidth.substr(0,domWidth.length-2);
				domWidth=(window.innerWidth-domWidth)/2;
				domHeight=window.getComputedStyle(domUIs[i]).height;
				domHeight=domHeight.substr(0,domHeight.length-2);
				domHeight=(window.innerHeight-domHeight)/2;
			}
			switch(domUIs[i].dataset.sustyle){
				case"follow":
					domUIs[i].style.cssText+="left:"+(e.clientX+10)+"px;"
						+"top:"+(e.clientY+30)+"px"
					break;
				case"center":
					console.log("[GestureUp] center")
					domUIs[i].style.cssText+="left:"+domWidth+"px;"
						+"top:"+domHeight+"px;";
					break;
				case"top":
					domUIs[i].style.cssText+="left:"+domWidth+"px;"
						+"top:0";
					break;
				case"ui_bottom":
					domUIs[i].style.cssText+="left:"+domWidth+"px;"
						+"bottom:-1px;";
					break;
				case"left":
					domUIs[i].style.cssText+="left:0px;"
						+"top:"+domHeight+"px;";
					break;
				case"right":
					domUIs[i].style.cssText+="right:0px;"
						+"top:"+domHeight+"px;";
					break;
			}
		}
	},
	clearUI:function(){
		if(!sue.document){return;}
		sue.document.querySelector("div[data-suui=line]")?sue.document.querySelector("div[data-suui=line]").remove():null;
		var doms=sue.document.querySelectorAll("div[data-suui=uibox]");
		for(var i=0;i<doms.length;i++){
			if(doms[i]){doms[i].remove()}
		}
		sue.drawing=false;
	},
	stopMges:function(e){
		console.log("[GestureUp] stop")
		if(sue.break){
			sue.clearUI();
			sue.break=false;
			return;
		}
		sue.clearUI();
		if(editMode){
			editDirect=sue._dirArray;
			var getele=function(ele){
				if(ele.tagName.toLowerCase()=="smartup"&&ele.classList.contains("su_apps")){
					return ele;
				}else{
					return getele(ele.parentNode);
				}
			}
			var boxOBJ=getele(document.querySelector(".su_app_test"));
			boxOBJ.querySelector(".testbox").innerText=sue._dirArray;
		}else{
			sue.sendDir(sue._dirArray,"action",e);
		}
		
		if(sue.timeout){window.clearTimeout(sue.timeout);sue.break=false;}
		e.preventDefault();
		sue._dirArray="";
		sue.drawing=false;
	},
	sendDir:function(dir,dirType,e){
		var returnValue;
		
		// Check if extension context is still valid
		if (!extensionContextValid || !checkExtensionContext()) {
			// Silently fail when extension context is invalidated
			// This prevents console spam when extension is reloaded
			return;
		}
		
		// If config is not properly loaded, try to reload it
		if (!config || !config.general) {
			console.warn("[GestureUp] Config not available in sendDir, attempting to reload...");
			if (!configLoadState.isLoading) {
				loadConfigWithRetry();
			}
			return;
		}
		
		try {
		chrome.runtime.sendMessage(extID,{type:dirType,direct:dir,drawType:sue.drawType,selEle:sue.selEle},function(response){
				// Check for runtime errors
				if (chrome.runtime.lastError) {
					// Extension context has been invalidated, mark it and show notification
					if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
						if (extensionContextValid) {
							extensionContextValid = false;
							showExtensionContextNotification();
						}
						return;
					}
					console.warn("[GestureUp] Runtime error in sendDir:", chrome.runtime.lastError.message);
					return;
				}
				
  			returnValue=response;
  			sue.getedConf=returnValue;
  			if(!response){return false;}
  			switch(response.type){
  				case"tip":
  					sue.ui_tip(response,e);
  					sue.ui_note(response,e);
  					sue.ui_allaction(response,e);
  					sue.uiPos(e);
  					break;
  				case"action":
  					break;
  			}
		});
		} catch (error) {
			// Mark context as invalid and show notification on any error
			if (extensionContextValid) {
				extensionContextValid = false;
				showExtensionContextNotification();
			}
		}
	}
}
chrome.runtime.onMessage.addListener(function(message,sender,sendResponse) {
	try {
	console.log("[GestureUp] message",message)
	if(message.type=="set_confirm"){
		// sendResponse({type:message.type,message:true});
		if(confirm(safeGetI18nMessage("tip_closemulticonfirm", "You are trying to close multiple tabs. Are you sure you want to continue?"))){
			sendResponse({type:message.type,message:true});
		}
	}
	if(message.type=="status"){
		sendResponse({type:message.type,message:true})
	}
	if(message.type=="icon"||message.type=="pop"){//icon action
		sue.selEle={};
		sue.selEle.txt=window.getSelection().toString();
		// fix firefox get selection frome textbox
		if(browserType=="fx"){
			if(e.target.tagName.toLowerCase=="textarea"||(e.target.tagName.toLowerCase=="input"&&e.target.type=="text")){
				sue.selEle.txt=e.target.value.substring(e.target.selectionStart,e.target.selectionEnd);
			}
		}
		console.log("[GestureUp] selEle",sue.selEle)
		sendResponse({type:"action_"+message.type,selEle:sue.selEle});
	}
	if(message.type=="extdisable"){
		extDisable=true;
	}
	if(message.type=="setapptype"){
		sue.appType[message.apptype]=true;
	}
	switch(message.type){
		case"fix_switchtab"://fix contextmenu from switchtab by rges or wges
			sue.cons.switchtab={};
			sue.cons.switchtab.contextmenu=true;
			sendResponse({type:message.type,message:true});
			break;
		case"actionPaste":
			sue.startEle.value+=message.value.paste;
			break;
		}
	} catch (error) {
		console.warn("[GestureUp] Error in message listener:", error.message);
	}
});
// Initialize configuration loading with complete error handling and retry mechanism
loadConfigWithRetry();
