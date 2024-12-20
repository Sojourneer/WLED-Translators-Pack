console.log("L12N.js (I18N/scripts) loading")
baseUrlLangfiles = "/langs/"
//baseUrlLangfiles ="https://raw.githubusercontent.com/Sojourneer/WLED/refs/heads/0_15/wled00/I18N/langs/"

/* Unused
const generateID = function(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
*/

//Note: localStorage uses UTF-16 for both keys and values.
I18N = function() {
    this.undo = [];
    this.langCode = "en";
    if(localStorage.getItem("I18N.langCode") == null)
        localStorage.setItem("I18N.langCode","en")
    this.translateableIds = [];
    this.translation = null;

    /*
    try {
        this.filetag = document.getElementById("I18N:template").textContent;
    }
    catch(e) {
        this.filetag = null;
    }
    */
}

// Apply translation for language in I18N.langCode or switch languages to the specified code 
I18N.prototype.setLang = function(langCode)     // undefined means keep the setting and apply
{
    self = this;

    // langCode==undefined means: Apply Translation for Current LangCode
    // Otherwise, switch to the specificed language
    console.log("I18N.setLang", langCode);
    if(langCode != undefined) {  
        if(localStorage.getItem("I18N.langCode") == langCode)
            return;
        this.undoAll(); // prepare by setting UI back to base language
        localStorage.setItem("I18N.langCode", langCode);
    }

    // At this point: I18N.langCode is set; UI needs to reflect it; UI is the original text
    langCode = localStorage.getItem("I18N.langCode");
    if(langCode == "en")
        return; // The UI is already in english 

    // Get the translationdata and apply it
    console.log("I18N getTranslationData(",langCode)
    sJson = localStorage.getItem("I18N.lang." + langCode);
    if(sJson) {
        console.log("I18N translation Data in LS",sJson.length);
        self.translation = JSON.parse(sJson);
        console.log("I18N", self.translation);
        self.applyTranslation();    
        return;
    }

    // Need to fetch translation data
    fetch(baseUrlLangfiles + langCode + ".json")
    .then((res)=>{
        if (!res.ok) {
            showToast("Unable to load translation file");
            return;
        }
        return res.json();
    })
    .then((json)=>{
        console.log("I18N fetched json", json);
        localStorage.setItem("I18N.langs." + langCode, JSON.stringify(json));
        self.translation = json;
    })
    .catch((e)=>{
        showToast("Unable to load translation file");
        return null;
    })
    .finally(()=>{
        if(self.translation != null)
            self.applyTranslation();
    });
}


// Apply current translation.  Ccan be called to extend the translation on changing the UI.
I18N.prototype.applyTranslation = function()
{
    this.LocalizeHTML();
}

// Translation support functions
// Has the node already been translated?
I18N.prototype.isTranslated = function(node)
{
    return this.undo.some(entry => entry.node === node); 
}

// Has the node already been translated?
I18N.prototype.hasTranslation = function(text)
{
    if(text in this.translation.exact)
        return true;
    
    if(Object.keys(this.translation.pattern).length == 0)
        return false;
    for(pattern in this.translation.pattern) {
        rePattern = RegExp(pattern)
        if(rePattern.test(text))
            return true;
    }
    return false;
}

// Set all translated nodes back to original (=English) values.
I18N.prototype.undoAll = function()
{
    if(this.undo.length == 0)
        return;
    for(i=0; i < this.undo.length; ++i)
    {
        translated = this.undo[i];
        translated.node.nodeValue = translated.original;
    }
    this.undo = [];
}

var templateName;

I18N.prototype.TranslateText = function(text) {
   //TODO support multiple translations

   if(text in this.translation.exact) {
       result = this.translation.exact[text];
   } else {
        for(pattern in this.translation.pattern) {
            rePattern = RegExp(pattern)
            entry = this.translation.pattern[pattern];
            //console.log("I18N: trying ",pattern, entry);
            if(m = text.match(rePattern)) {
                result = text.replace(rePattern, entry);
                console.log("I18N",rePattern, entry, result);
                return result;
            }
        }
   }
   console.log(text,result);
   return result;
}

I18N.prototype.LocalizeHTML = function()
{
    console.log(templateName);
    self = this;

    function traverse(e) {
        function translateAttribute(attrName, node) {
            if(e.hasAttribute(attrName)) {
                if(self.hasTranslation(value = e.getAttribute(attrName))) {
                    attr = e.attributes[attrName];
                    if(! self.isTranslated(attr)) {
                        self.undo.push({node:attr, original:value})
                        e.setAttribute(attrName, self.TranslateText(value));
                    }
                }
            }
        }

        switch(e.nodeType) {
            case 1:
                if(e.tagName == "SCRIPT") break; // Note: impossible to get external script content

                // Look at atrributes, and then descend
                translateAttribute("title", e);
                translateAttribute("placeholder", e);
                if(e.tagName == "input")
                    translateAttribute("label", e);

                for(var i=0; i < e.childNodes.length; ++i)
                    traverse(e.childNodes[i]);
                break;
            case 3:
                if(self.isTranslated(e))
                    break;
                if(self.hasTranslation(e.nodeValue)) {
                    self.undo.push({node:e, original: e.nodeValue});
                    e.nodeValue = self.TranslateText(e.nodeValue);
                }
                break;
        }
    }
    traverse(document.body);

    return;
}

console.log("creating I18N");
I18N.singleton = new I18N();
function runI18N() // call when everything has been loaded
{
    console.log("runI18N");

    // Wrap functions that use text needing translation
    if(typeof window.showToast == "function") { // effect: translate showToast text
        window.showToast = (function() {
        var cached_function = window.showToast;

        return function(text, error = false) {
            if(I18N.singleton && I18N.singleton.translate && (text in I18N.singleton.translation)) {
                translation = I18N.singleton.translation[text];    
            } else
                translation = text;
            console.log("showToast",text, translation);
            var result = cached_function.apply(this, [translation, error]);

            return result;
        };
        })();
    }

    if(typeof window.updateUI == "function") { // effect: retranslate on updateUI
        window.updateUI = (function() {
            var cached_function = window.updateUI;
        
            return function() {
                var result = cached_function.apply(this, arguments);

                // translate again
                I18N.singleton.setLang();
                return result;
            };
        })();   
    }

    if(typeof window.genForm == "function") { // effect: retranslate on updateUI
        window.genForm = (function() {
            var cached_function = window.genForm;
        
            return function() {
                var result = cached_function.apply(this, arguments);

                // translate again
                I18N.singleton.setLang();
                return result;
            };
        })();   
    }
    
    // makePUtil
    if(typeof window.makePUtil == "function") { // effect: retranslate on updateUI
        window.makePUtil = (function() {
            var cached_function = window.makePUtil;
        
            return function() {
                var result = cached_function.apply(this, arguments);

                // translate again
                I18N.singleton.setLang();
                return result;
            };
        })();   
    }

    // makePlUtil
    if(typeof window.makePlUtil == "function") { // effect: retranslate on updateUI
        window.makePlUtil = (function() {
            var cached_function = window.makePlUtil;
        
            return function() {
                var result = cached_function.apply(this, arguments);

                // translate again
                I18N.singleton.setLang();
                return result;
            };
        })();   
    }

    //makeSeg
    if(typeof window.makeSeg == "function") { // effect: retranslate on updateUI
        window.makeSeg = (function() {
            var cached_function = window.makeSeg;
        
            return function() {
                var result = cached_function.apply(this, arguments);

                // translate again
                I18N.singleton.setLang();
                return result;
            };
        })();   
    }


    I18N.singleton.setLang();
}

console.log("L12N.js (I18N/scripts) loaded")