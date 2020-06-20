import * as http2 from 'http2';
import * as fs from 'fs';

const server = http2.createSecureServer({
    key: fs.readFileSync('localhost-privkey.pem'),
    cert: fs.readFileSync('localhost-cert.pem')
});

server.on("request", (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write("hello, jeremy")
    res.end()
})

// server.on("stream", (stream) => {
//     stream.respond({ ':status': 200, 'content-type': 'text/plain' });
//     stream.write('hello ');
//     stream.end('world');
// })

server.listen(7344)