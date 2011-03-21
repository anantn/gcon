/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Stacky.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	Anant Narayanan <anant@kix.in>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const DOMAINS = [
    "http://mail.google.com/a/",
    "https://mail.google.com/a/"
];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

function GCon(win, add)
{
    this._addon = add;
    this._window = win;
    this._count = 0;
    this._domains = {};
    
    // Hang on, the window may not be fully loaded yet
    let self = this;
    function checkWindow()
    {
        if (!win.document.getElementById("nav-bar")) {
            let timeout = win.setTimeout(checkWindow, 1000);
            unloaders.push(function() win.clearTimeout(timeout));
        } else {
            self.initialize();
        }
    }
    checkWindow();
}
GCon.prototype = {
    initialize: function() {
        let self = this;
        
        // Check for tabbrowser and attach DOMContentLoaded
        function checkBrowserAndAttach(self, tab) {
            let browser = self._window.gBrowser.getBrowserForTab(tab);
            if (!browser) {
                let timeout = self._window.setTimeout(checkBrowserAndAttach, 500);
                unloaders.push(function() self._window.clearTimeout(timeout));
            } else {
                if (browser.contentDocument &&
                    browser.contentDocument.readyState == "complete") {
                    self.iconify(tab);
                } else {
                    browser.addEventListener("DOMContentLoaded", function(evt) {
                        self.iconify(tab);
                    }, false);
                }
            }
        }
        
        // Call iconify for all currently open tabs...
        let browser = self._window.gBrowser;
        for (let i = 0; i < browser.tabs.length; i++) {
            let tab = browser.tabs[i];
            checkBrowserAndAttach(self, tab);
        }

        // ...and listen for TabOpen events so we can apply icons for the future
        self._window.gBrowser.tabContainer.addEventListener("TabOpen", function(evt) {
            let tab = evt.target;
            checkBrowserAndAttach(self, tab);
        }, false);
        
        // sometimes pinning tabs will change the icon, make sure to handle that
        self._window.gBrowser.tabContainer.addEventListener("TabPinned", function(evt) {
            let tab = evt.target;
            checkBrowserAndAttach(self, tab);
        }, false);
    },
    
    iconify: function(tab) {
        let browser = this._window.gBrowser.getBrowserForTab(tab);
        
        // Only change icon if we are on a google apps mail domain
        let uri = browser.currentURI.spec;
        let matched = false;
        for (let i in DOMAINS) {
            let check = DOMAINS[i];
            if (uri.substr(0, check.length) == check)
                matched = true;
        }
        if (!matched) return;

        let iconURI;
        if (uri in this._domains) {
            iconURI = this._domains[uri];
        } else {
            iconURI = this._addon.getResourceURI("icons/" +
                this._count++ % 2 + ".ico").spec;
            this._domains[uri] = iconURI;
        }
        
        let binding = "url(" + this._addon.getResourceURI("tab.xml").spec + 
            "#tabbrowser-tab-with-icon)";
        // Only load binding if neccessary
        if (tab.style.MozBinding != binding)
            tab.style.MozBinding = binding;
        
        // Wait for overlay to take effect and then set icon
        let self = this;
        function setIcon()
        {
            if (!tab.mTabIcon) {
                let timeout = self._window.setTimeout(setIcon, 500);
                unloaders.push(function() self._window.clearTimeout(timeout));
            } else {
                tab.mTabIcon.src = iconURI;
            }
        }
        setIcon();
    }
};

let unloaders = [];
function startup(data, reason) AddonManager.getAddonByID(data.id, function(addon)
{
    /* We use winWatcher to create an instance per window (current and future) */
    let iter = Cc["@mozilla.org/appshell/window-mediator;1"]
               .getService(Ci.nsIWindowMediator)
               .getEnumerator("navigator:browser");
    while (iter.hasMoreElements()) {
        new GCon(iter.getNext().QueryInterface(Ci.nsIDOMWindow), addon);
    }
    function winWatcher(subject, topic) {
        if (topic != "domwindowopened")
            return;
        subject.addEventListener("load", function() {
            subject.removeEventListener("load", arguments.callee, false);
            let doc = subject.document.documentElement;
            if (doc.getAttribute("windowtype") == "navigator:browser") {
                new GCon(subject, addon);
            }
        }, false);
    }
    
    Services.ww.registerNotification(winWatcher);
    unloaders.push(function() Services.ww.unregisterNotification(winWatcher));
})

function shutdown(data, reason)
{
    if (reason !== APP_SHUTDOWN)
        unloaders.forEach(function(unload) unload && unload());
}

function install()
{
}

function uninstall()
{
}

