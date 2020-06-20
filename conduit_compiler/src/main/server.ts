import * as http from 'http';

http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write("hello, jeremy")
    res.end()
}).listen(7344)