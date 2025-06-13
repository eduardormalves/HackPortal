const express = require('express');
const port = 5380;
const app = express();

app.get('/', (req, res) => {
    res.render('index');
})

app.listen(port, () => {
    console.log(`Servidor rodando na porta: ${port}`);
})

app.set('view engine', 'ejs');

module.exports = app;
