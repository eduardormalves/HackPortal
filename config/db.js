const mysql = require ('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'erma5896',
    database: 'hackportal'
});

connection.connect((err) => {
    if(err){
        console.log("Erro ao conectar no SQL!" + err);
        return;
    } else {
        console.log("SUCESSO! Conectado no banco de dados")
    }
})

module.exports = connection; 