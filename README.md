# WLED Translators Pack

The WLED Translator's Pack repository provides the tools for Internationalizing and Translating WLED.
Internationalization/Translation for WLED provides the ability to switch between display languages dynamically from the WLED UI settings page.  This setting is local to the browser, and is effective immediately (no Save or page refresh is required).

The WLED Translator's pack comprises a Node.js proxy server and translation tools.
The proxy server is used to automatically insert javascript into WLED html pages to scrape text for translation (Internationalization aka "I18N") or to translate text (Localization aka "L12N") of a running WLED instance.
The translation tools are used to tune the results of scraping, apply Google Translate to do the actual translation, tune the translation results, and deploy the language files.

<i>Translations can also be deployed without the proxy by inserting a few lines of javascript into the WLED UI source files. This is the prefrred method for deployment. The injectL12N.py python script can make these insertions automatically.</i> 

The rest of this document explains the process for using the Translator's Pack to Internationalize and Localize WLED. 

## Process overview

There are 4 subprocesses with supporting tools, detailed below. 

1. I18N (proxy.js -m I18N): Extracting text displayed in the WLED UI by 'screen scraping'.  Text is extracted from text nodes and certain attributes. It is possible to manually change some of the scraped text into regular expressions.   
The proxy will also automatically scrape any json files served to the browser.

2. Translation (L12N.py) into desired languages indicated by their ISO639-1 codes, using the Google Translation API.  The resulting translation file lists the phrases and where they occur.  The translation text can be manually adjusted.  If a phrase requires different translations depending on its context, the entry can be manually changed to contain multiple translations with the associated context.   
Before these translation files can be used, the installLang.py optimization script must be applied to remove extraneous context information and to output the optimized format used for testing and deployment.

3. L12N (proxy.js -m L12N): applying the translated text for validation to the translated UI using the provided UISimulator Web Server.

4. Deployment of the translated UI, comprising:   
   a. committing the phrase translation file for each language to Github   
   b. for each HTML page inserting the L12N.js script and calls to the setLang() function whenever the UI is changed.  This is a one time change. The injectL12N.py script is provided to make these changes.   
   c. Building of the UI and application with the standard tools.


## Internationalization


## Translation


# WLED Localization

## Proxy Server
The proxy server injects scripts used for the I18N and L12N processes into the HTML served by a running WLED instance, and accepts POST back of scraped text.
One of three modes can given as a parameter when launching the Proxy:

1. (No mode).  The HTML text is served up without changes.

2. I18N.  Into every HTML page it serves, the Simulator injects the I18N script (or replaces the L12N script if present), and adds a call to run18N in body.onload() to do the screen scraping.  The I18N.js script is also used to wrap functions such as genForm and showToast, that add text in the UI, to capture that text. (Equivalent changes can also be done directly into the pages if desired).   
At the end of a screen scraping invocation, the captured text is POSTed back to the Simulator, which saves it.  The screen scraping functions are incremental, ignoring previously reported text.   
If desired, screen scraping can be manually invoked as <b>I18N.singleton.scrape(optionalTag)</b> from the browser developer tools.

3. L12N.  This is similar to the I18N mode, except the L12N.js script is injected.  As a consequence, instead of text capture a selected translation is applied. This is useful in checking translations.

 ## Process tools

 | Process | Tool | Inputs | Outputs |
 | ---     | ---  | ---    | --- |
 | I18N | UISimulator | UI.  The user exercises the UI as much as possible in order to capture as much text as possible. | I18N/data/* |
 | Translation | L12N.py | I18N/data/* | I18N/L12N/&lt;la&gt;.json |
 | (Translation file finalization) | installLangs.js | I18N/L12N/&lt;la&gt;.json<br>I18N/data/iso639.json | I18N/langs/&lt;la&gt;.json |
 | Deployment | injectL12N.py | wled00/data/*<br>or I18N/list.json | wled00/data/*<br>File formatting is preserved. | 

The output files from the I18N and Translation (L12N.py) can be manually adjusted, and those changes will be preserved across invocations of the various tools.

# Manual adjustments

## Adjusting I18N/fromPage/* files
Here is a standard entry.
```
{
   "content": "Segment 0"
},
```
We can change this exact phrase to use a pattern, as follows:
```
{
   "content": "Segment 0"
   "pattern": "^Segment ([0-9]+)$"
},
```

This will be translated to L12N/&lt;lang&gt;.json to:
```
{  "exact: { ... }
   "pattern": { ...
        "Segment 0": {
            "text": "Segment 0",
            "translations": [
                {
                    "translation": "セグメント $1",
                    "for": {
                         "_settings_ui.json": [ 234 ],
                         "index.htm.json": [ 512 ]
                     }
                }
            ],
            "pattern": "^Segment ([0-9]+)$"
        }
```

on eventually to:
```
   "pattern": { . . .
        "^Segment ([0-9]+)$": "セグメント $1",

```


## Adjusting L12/*.json files
In the above example, we can see the translations object is an length 1 array of translation text (in this case a regular expression replace string) and where that translation applies.  If the translation must be different depending on the context, the single entry can be split up. 

```
{
          "translations": [ translation1:{for :{. . .}}, translation2:{for :{. . .}}]
},
```

# Required libraries
### Node.js libraries for proxy.js
- npm install argparse
- npm install html-parser
- npm install http-proxy
- npm install bodyparser
- npm install connect
- npm install sprintf-js

### Python libraries for translation tools
The scripts use python3 and the libraries beautifulsoup4, googletrans (I used 3.1.0a0), and a 1-line patched version of HTMLParser. 

