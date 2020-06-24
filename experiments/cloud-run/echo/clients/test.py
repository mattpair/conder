
import clients
from models import test_pb2 as m

t = m.Shout()
t.content = "my first shout"

echo = m.Shout()
echo.ParseFromString(clients.echo(t).content) 

print(echo.content)
# print(clients.hello().text)