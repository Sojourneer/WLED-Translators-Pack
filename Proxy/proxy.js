/* 
   
To Do:
1. port the python code to h_PostI18N.  Now I'm just overwriting every time
2. Complete the html modification, including the cliargs.mode handling
3. Look at /ws, which is a websocket
*/
const { ArgumentParser, ArgumentError } = require('argparse');

const http = require('http');
const httpProxy = require('http-proxy');
const connect = require('connect');
const bodyParser = require('body-parser');
const zlib = require('node:zlib');
const url = require('url'); 
const htmlparser = require('node-html-parser');
const fs = require('node:fs');
const sprintf = require('sprintf-js').sprintf;

// COrrecting a bug in 'connect-restreamer', and tweaking the functionality
restreamer = function (options) {
    options = options || {}
    options.property = options.property || 'body'
    //options.stringify = options.stringify || JSON.stringify
    options.stringify = options.stringify || function(x) { return x; }

    return function (req, res, next) {
        console.log("restreamer 0", req.headers, options.property, req[options.property]);
        if(false == (req.headers['content-length'] in options.types)) {
            next();
            return;       
        }
      console.log("restreamer 1", req.headers, options.property, req[options.property]);
      req.removeAllListeners('data')
      req.removeAllListeners('end')
      if(req.headers['content-length'] !== undefined /*&& req.headers['transfer-encoding'] !== "chunked"*/){
        req.headers['content-length'] = Buffer.byteLength(options.stringify(req[options.property]), 'utf8')
      }
      //req.headers["accept-encoding"] = "identity";
      //delete req.headers["transfer-encoding"];
      //req.headers["connection"] = "close";
      console.log("restreamer 2", req.headers, options.stringify.toString());
      process.nextTick(function () {
        if(req[options.property]) {
          if('function' === typeof options.modify)
            req[options.property] = options.modify(req[options.property])
          req.emit('data', options.stringify(req[options.property]))
        }
        req.emit('end')
      })
      next();
    }
  }

  /*
lookupContentType = function(ext) {
        ".htm":  {"ct": "text/html", "enc":lambda text: bytes(text,"UTF-8"), "mode":"r"},
        ".html": {"ct": "text/html", "enc":lambda text: bytes(text,"UTF-8"), "mode":"r"},
        ".css": {"ct": "text/css", "enc":lambda text: bytes(text,"UTF-8"), "mode":"r"},
        ".json": {"ct": "application/json", "enc":lambda text: bytes(text,"UTF-8"), "mode":"r"},
        ".js":   {"ct": "text/javascript", "enc":lambda text: bytes(text,"UTF-8"), "mode":"r"},
        ".ico":  {"ct": "image/vnd.microsoft.icon", "enc": lambda d: d, "mode":"rb"},
        ".icon":  {"ct": "image/vnd.microsoft.icon", "enc": lambda d: d, "mode":"rb"}
}
*/

// ---------------------- CLI parsing
function isIP(s) {
    segs = s.split('.');
    if(segs.length != 4)
        throw ArgumentError("bad IP address");
    function valid(x) { if(isNaN(x)) return false; i = parseInt(x); return i >= 0 && i <= 255; }
    if(! segs.every(valid))
        throw ArgumentError("Bad IP address");
    return s;
}

const cliparser = new ArgumentParser({ description: 'WLED I18N proxy.' });
cliparser.add_argument('-W', '--WLED',     { type: isIP, required:true, help: 'IP of WLED instance to proxy' });
cliparser.add_argument('-m', '--mode',    {  choices: ['I18N','L12N'], required:true, help: 'Proxy running mode' });

let cliargs = cliparser.parse_args();

const proxy = httpProxy.createProxyServer({ws:true});

// ----------------------- request and response handlers
function h_PostI18N(req, res, options) {
    // TBD
    parsed = url.parse(req.url);

    var contentType = req.headers['content-type'];
    var bodyData;
  
    if (contentType === 'application/json') {
      bodyData = JSON.stringify(req.body);
    }

    if (contentType === 'application/x-www-form-urlencoded') {
      bodyData = queryString.stringify(req.body);
    }
  
    if(bodyData) {
        filePath = options.root + parsed.path.substring(options.pathPrefix.length)
        //console.log("data length",bodyData.length, filePath);
    
        fs.writeFile(filePath, bodyData, err => {
            if(err) {
                msg = "Error: " + err.toString();
                console.error(msg,"h_PostI18N write",err);
                res.setHeader("Content-Type", "text/plain");
                res.end(msg);
            } else {
                res.setHeader("Content-Type", "text/plain");
                res.end(sprintf("Posted %1$s bytes",bodyData.length));
            }
        });
    }
};

function h_FetchAsset(req, res, options) {
    console.log("h_FetchAsset",options.file);
    fs.readFile(options.file, 'utf8', (err,data) => {
        if(err) {
            msg = "Error: " + err.toString();
            console.error(msg,"h_FetchAsset read",err);
            res.setHeader("Content-Type", "text/plain");
            res.end(msg);
            return;
        }
        res.setHeader("content-type", options['content-type']);
        res.write(data);
        res.end();
    })
};
function h_SelfHandleDefault(req, res, options) {
    console.log("h_SelfHandleDefault");
    proxy.web(req, res,
        { target: 'http://' + cliargs.WLED, selfHandleResponse: true },
        (err) => {
            msg = "Error: " + err.toString();
            console.error(msg,"h_SelfHandleDefault",err);
            //res.setHeader("Content-Type", "text/plain");
            res.end(msg);
        });
};
function h_Default(req, res, options) {
    console.log("h_Default");
    proxy.web(req, res,
        { target: 'http://' + cliargs.WLED, selfHandleResponse: false },
        (err) => {
            msg = "Error: " + err.toString();
            console.error(msg,"h_Default",err);
            //res.setHeader("Content-Type", "text/plain");
            res.end(msg);
        });
};

function hr_patchHtml(proxyRes, req, res, buffer, options) {
    //console.log(res.rawHeaders, proxyRes.rawHeaders, proxyRes.headers['content-type']);
    //if(parsed.host == cliargs.WLED && proxyRes.headers['content-type'] == "text/html") { // works
    console.log("hr_patchHtml", parsed.host, parsed.path, proxyRes.headers['content-type']);

    rawData = zlib.gunzipSync(buffer).toString('utf8');

    dom = htmlparser.parse(rawData);
    head = dom.getElementsByTagName("head")[0];
    //console.log(head);
    scripts = head.getElementsByTagName("script");
    L12N = null;
    for(i=0; i < scripts.length; ++i) {
        script = scripts[i];
        if(script.getAttribute("src") != null && script.getAttribute("src").indexOf("L12N.js") != -1) {
            L12N = script; // src=L12N
            break;
        }
        if(script.getAttribute("src") == null && script.text.indexOf("L12N.js loaded") != -1) {
            L12N = script;  // content = L12N
            break;
        }
    }
    if(L12N != null) {
        console.log("replacing L12N with I18N.js"); 
        L12N.replaceWith("<script src='I18N.js'></script>");    
    } else {
        console.log("inserting I18N.js"); 
        head.append("<script src='I18N.js'></script>")
    }
    patched = dom.toString();
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Transfer-Encoding", "");
    res.write(patched);
    res.end();
    console.log("res from proxied server:", rawData.length, patched.length);
}
function hr_saveJson(proxyRes, req, res, buffer, options) {
    var parsed = url.parse(req.url);
    console.log("hr_saveJson", parsed.host, parsed.path, proxyRes.headers['content-type']);

    res.setHeader("Content-Type", "application/json");
    res.write(buffer);
    res.end();
    //proxyRes.end();  NOPE, no such function

    var basename = parsed.path.match(/[^/]+$/)[0]
    if( ! basename.endsWith(".json"))
        basename += ".json"

    filePath = options.root + basename;

    fs.writeFile(filePath, buffer, err => {
        if(err) {
            console.error(err);
        } else {
            console.log("saved");
        }
    });
  
}

requestHandlers = [
    {pathPrefix:'/I18N/', method:'POST', handler: h_PostI18N,
        handlerOptions:{ pathPrefix:'/I18N/', root: '../I18N_Assets/scraped/' }},
    {path:'/I18N.js',                    handler: h_FetchAsset,
        handlerOptions:{file:'assets/scripts/I18N.js', 'content-type':'text/javascript'}},
    {path:'/L12N.js',                    handler: h_FetchAsset,
        handlerOptions:{file:'assets/scripts/L12N.js', 'content-type':'text/javascript'}},
    {method:'POST',                      handler: h_Default},
    {                                    handler: h_SelfHandleDefault}
];
responseHandlers = [
    {reqHost: cliargs.WLED, 'content-type':'text/html',           handler: hr_patchHtml },
    {reqHost: cliargs.WLED, 'content-type':'application/json',    handler: hr_saveJson,   handlerOptions:{ root: '../I18N_Assets/json/' } }

];

// - request and response rulebase support
function findRequestHandler(req) {
    parsed = url.parse(req.url);
    function checkHandler(rule, path, method) {
        if("path" in rule && rule.path != path) return false;
        if("pathPrefix" in rule && !path.startsWith(rule.pathPrefix)) return false;
        if("method" in rule && rule.method != method) return false;
        return true;
    }
    
    for(i = 0; i < requestHandlers.length; ++i) {
        rule = requestHandlers[i];
        if(checkHandler(rule, parsed.path, req.method)) {
            return rule;
        }
    }
    return null;
}
function findResponseHandler(proxyRes, req, res) {
    parsed = url.parse(req.url);
    //console.log('findResponseHandler', parsed, responseHandlers);
    function checkHandler(rule, path, method) {
        if("reqHost" in rule && rule.reqHost != parsed.host) return false;
        if("content-type" in rule && rule['content-type'] != proxyRes.headers['content-type']) return false;
        return true;
    }
    
    for(i = 0; i < responseHandlers.length; ++i) {
        rule = responseHandlers[i];
        if(checkHandler(rule, parsed.path, req.method)) {
            return rule;
        }
    }
    return null;
}

// The actual Web/proxy server
var app = connect()
  /*
    .use("/ws", function(req,res) {  // DOESN'T FIRE
    parsed = url.parse(req.url);
    console.log("connectWS: ",req.method, parsed.protocol, parsed.host, parsed.path);
    //proxy.ws("/ws", {target: "ws://192.168.1.17",ws: true}
  })
  */
  //.use(bodyParser.urlencoded({type:'application/x-www-form-urlencoded'})) //urlencoded parser
  // Keep raw because we are sending them on to the acxtual server
  .use(bodyParser.raw({type:'application/x-www-form-urlencoded'})) //urlencoded parser
  .use(bodyParser.raw({type:'application/json'})) //json parser
  .use(restreamer({types:['application/json','application/x-www-form-urlencoded']}))
  //.use("ws://192.168.1.17/ws", function(req,res) {
  //  parsed = url.parse(req.url);
  //  console.log("connectWS: ",req.method, parsed.protocol, parsed.host, parsed.path);
  //})
  .use(function(req, res){
    // modify body here,
    // eg: req.body = {a: 1}.
    //console.log('proxy body:',req.body)

    parsed = url.parse(req.url);
    console.log("connect: ",req.method, parsed.protocol, parsed.host, parsed.path, req.body);
    if(parsed.host != cliargs.WLED) {
        console.log("Non-WLED", req.url);
        proxy.web(req, res,
            {
                secure :true,
                target: parsed.protocol + "//" + parsed.host
                //ssl: {
                //    key: fs.readFileSync('valid-ssl-key.pem', 'utf8'),
                //    cert: fs.readFileSync('valid-ssl-cert.pem', 'utf8')
                //  }
             },
            (err) => {
                msg = "Error: " + err.toString();
                console.error(msg,"non WLED proxy");
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(msg);
            });
        return;
    }

    //DOESNT fire
    if(parsed.protocol == "ws") {
        console.log("ws");
        proxy.web(req, res,
            { target: {host: cliargs.WLED}, ws:true },
            (err) => {
                msg = "Error: " + err.toString();
                console.error(msg,"ws handler");
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(msg);
            });
    }

    rule =  findRequestHandler(req);
    if(rule) {
        rule.handler(req, res, rule.handlerOptions);
        return;
    }

    // Default if no handler found
    console.log("Fallthru default handler", req.url);
    proxy.web(req, res,
        { target: {host: cliargs.WLED}, ws:true },
        (err) => {
            msg = "Error: " + err.toString();
            console.error(msg,"Fallthru handler");
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(msg);
        });
})
;

const server = http.createServer(app,{ws:true});

server.on('upgrade', function(req, socket, head) {
    console.log("server upgrade");
    proxy.ws(req, socket, head);
});
proxy.on('upgrade', function(req, socket, head) {
    console.log("proxy upgrade");
    proxy.ws(req, socket, head);
});

// Web Event handlers
//Note: this is called regardless of selfHandleResponse
proxy.on("proxyRes", function(proxyRes, req, res) {
    //console.log("on proxyRes 1", req.url, req.requestOptions, proxyRes.requestOptions);
    res.setHeader("Transfer-Encoding", "");
    console.log("on proxyRes 1", req.url, proxyRes.headers);

    parsed = url.parse(req.url);
    if(parsed.path == "/settings/leds")
        console.log(proxyRes.headers);  //DEBUG
    var buffer = Buffer.from("");

    proxyRes.on('data', function (data) {
        console.log("on proxyRes 2", data.length);
        buffer = Buffer.concat([buffer, data]);
    });
    proxyRes.on('end', function () {
        console.log("on proxyRes 3", buffer.length);
        rule =  findResponseHandler(proxyRes, req, res);
        if(rule) {
            console.log(rule);
            rule.handler(proxyRes, req, res, buffer, rule.handlerOptions);
            return;
        }
    
        // default
        if("content-type" in proxyRes.headers)
            res.setHeader("Content-Type", proxyRes.headers['content-type']);
        if("content-encoding" in proxyRes.headers) 
            res.setHeader("Content-Encoding", proxyRes.headers['content-encoding']);
        //res.removeHeader("Transfer-Encoding");
        res.setHeader("Connection","close");
        res.write(buffer);
        res.end();
        //proxyRes.end();
    });
});

server.listen(8000, () => {
console.log('Proxy server is running on http://localhost:8000');
});
