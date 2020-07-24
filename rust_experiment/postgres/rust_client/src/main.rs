use postgres::{Client, NoTls};

struct PersonRequest {
    name: String,
}

#[derive(Debug)]
struct Person {
    id: i32,
    name: String,
}

fn postgres_method() -> Result<Vec<Person>, postgres::Error> {
    let mut client = Client::connect("host=localhost user=postgres password=password", NoTls)?;

    client.batch_execute("
        CREATE TABLE if not exists Person (
            id      SERIAL PRIMARY KEY,
            name    TEXT NOT NULL
        )
    ")?;

    let p = PersonRequest {
        name: "Jeremy".to_string(),
    };

    
    client.execute(
        "INSERT INTO Person (name) VALUES ($1)",
        &[&p.name],
    )?;
    let mut people: Vec<Person> = Vec::new();
    for row in client.query("SELECT id, name FROM Person", &[])? {
        
        people.push(Person {
            id: row.get(0),
            name: row.get(1),
        })
        // let id: i32 = 
        // let name: &str = 
        // let data: Option<&[u8]> = 

        // println!("found Person: {} {} {:?}", id, name, data);
    }
    Ok(people)
}

fn main() {
    let out = postgres_method();
    println!("output {:?}", out)
}
