import * as http2 from 'http2';
import * as fs from 'fs';
import * as yauzl from 'yauzl'

const server = http2.createSecureServer({
    key: fs.readFileSync('localhost-privkey.pem'),
    cert: fs.readFileSync('localhost-cert.pem')
});

server.on("request", (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    console.log(req.url)
    if (req.url === "/upload") {
        const allBuf: Buffer[] = []
        req.on("data", (chunk) => {
            allBuf.push(chunk as Buffer)
        })
        
        req.on("end", () => {
            const buf = Buffer.concat(allBuf)
            yauzl.fromBuffer(buf, {lazyEntries: true}, (err, zip) => {
                if (err) {
                    console.error(err)
                } else {
                    zip.on("entry", (entry) => {
                        if (/\/$/.test(entry.fileName)) {
                            console.log(`DIR ${entry.fileName}`)
                            // Directory file names end with '/'.
                            // Note that entries for directories themselves are optional.
                            // An entry's fileName implicitly requires its parent directories to exist.
                            zip.readEntry();
                          } else {
                              console.log(`FILE ${entry.fileName}`)
                            // file entry
                            zip.openReadStream(entry, function(err, readStream) {
                              if (err) throw err;
                              readStream.on("end", function() {
                                zip.readEntry();
                              });
                            //   readStream.pipe(somewhere);
                            });
                          }        
                    })
                    zip.readEntry()
                }
            })
        })
        
        
    } else {
        
        res.write("hello, jeremy")
    }
    
    res.end()
})

// server.on("stream", (stream) => {
//     stream.respond({ ':status': 200, 'content-type': 'text/plain' });
//     stream.write('hello ');
//     stream.end('world');
// })

server.listen(7344)