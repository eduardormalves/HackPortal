const app = require('./config/conf');
const connection = require('./config/db');
const upload = require('./config/upload'); // Importando upload.js

function atualizarStatusHacktons(callback) {
  const hoje = new Date().toISOString().split('T')[0];

  const sqlAtualizaAbertoParaAndamento = `
    UPDATE hackton
    SET status = 'Em Andamento'
    WHERE status = 'Em Aberto'
      AND data_inicio <= ? AND data_fim >= ?
  `;

  const sqlAtualizaAndamentoParaFechado = `
    UPDATE hackton
    SET status = 'Fechado'
    WHERE (status = 'Em Andamento' OR status = 'Em Aberto')
      AND data_fim < ?
  `;

  connection.query(sqlAtualizaAbertoParaAndamento, [hoje, hoje], (err1) => {
    if (err1) return callback(err1);

    connection.query(sqlAtualizaAndamentoParaFechado, [hoje], (err2) => {
      if (err2) return callback(err2);
      callback(null);
    });
  });
}

app.get('/', (req, res) => {
    res.render('login');
})

app.post('/enviaLogin', (req, res) => {
  const { login, senha, perfil } = req.body;

  let tabela;
  if (perfil === 'professor') {
    tabela = 'professor';
  } else if (perfil === 'aluno') {
    tabela = 'aluno';
  } else {
    return res.status(400).send('Perfil inválido');
  }

  const sql = `SELECT * FROM ?? WHERE email_edu = ? AND senha = ?`;
  connection.query(sql, [tabela, login, senha], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro no servidor.');
    }

    if (results.length > 0) {
      const user = results[0];

      // Salva os dados do usuário na sessão
      if (perfil === 'professor') {
        req.session.user = {
          perfil,
          nome: user.nome,
          email_edu: user.email_edu,
          id_professor: user.ID_professor
        };
        return res.redirect('/pdashboard');
      } else {
        req.session.user = {
          perfil,
          nome: user.nome,
          email_edu: user.email_edu
        };
        return res.redirect('/adashboard');
      }
    } else {
      return res.status(401).send('Login ou senha inválidos.');
    }
  });
});

app.post('/cadastrarUsuario', (req, res) => {
  const { nome, email_edu, matricula, data_nascimento, curso, senha, confirmar_senha } = req.body;

  // Verifica se senha e confirmação são iguais
  if (senha !== confirmar_senha) {
    return res.status(400).send('As senhas não coincidem.');
  }

  const sql = `INSERT INTO aluno (nome, email_edu, matricula, nascimento, curso, senha, coins)
               VALUES (?, ?, ?, ?, ?, ?, 0)`;

  const values = [nome, email_edu, matricula, data_nascimento, curso, senha];

  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error('Erro ao cadastrar aluno:', error);
      return res.status(500).send('Erro ao cadastrar. Tente novamente.');
    }

    // Redireciona para login após cadastro
    res.redirect('/');
  });
});


app.get('/adashboard', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }
  const email = req.session.user.email_edu;

  if (!email) {
    return res.redirect('/');
  }

  // Busca dados do aluno
  const sqlAluno = 'SELECT ID_aluno, nome, coins FROM aluno WHERE email_edu = ?';

  connection.query(sqlAluno, [email], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro no servidor.');
    }

    if (results.length === 0) {
      return res.redirect('/');
    }

    const user = results[0];

    // Busca hacktons para os quais o aluno enviou foto
    const sqlHistorico = `
      SELECT h.nome, f.data_envio
      FROM foto f
      INNER JOIN hackton h ON f.hackton_id = h.id_hackton
      WHERE f.aluno_id = ?
      ORDER BY f.data_envio DESC
    `;

    connection.query(sqlHistorico, [user.ID_aluno], (errHist, historico) => {
      if (errHist) {
        console.error(errHist);
        return res.status(500).send('Erro ao buscar histórico.');
      }

      res.render('alunoDashboard', {
        nome: user.nome,
        coins: user.coins,
        hacktonsHistorico: historico
      });
    });
  });
});

app.get('/ahacktons', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }

  atualizarStatusHacktons((err) => {
    if (err) {
      console.error('Erro ao atualizar status dos hacktons:', err);
      return res.status(500).send('Erro ao atualizar status dos hacktons.');
    }

    const email = req.session.user.email_edu;

    const sqlAluno = 'SELECT ID_aluno FROM aluno WHERE email_edu = ?';
    connection.query(sqlAluno, [email], (err, alunoResults) => {
      if (err || alunoResults.length === 0) {
        console.error('Erro ao buscar aluno:', err);
        return res.status(500).send('Erro no servidor.');
      }

      const alunoId = alunoResults[0].ID_aluno;

      // Buscar todos hacktons em que o aluno está inscrito (independente do status)
      const sqlHacktonsInscritos = `
        SELECT h.id_hackton, h.nome, h.data_inicio, h.data_fim, h.local, h.status
        FROM hackton h
        INNER JOIN participacao p ON h.id_hackton = p.hackton_id
        WHERE p.aluno_id = ?
        ORDER BY h.data_inicio ASC
      `;

      // Hacktons disponíveis (em aberto e que aluno não está inscrito)
      const sqlDisponiveis = `
        SELECT h.id_hackton, h.nome, h.data_inicio, h.data_fim, h.local, h.status
        FROM hackton h
        WHERE h.status = 'Em Aberto' 
          AND h.id_hackton NOT IN (
            SELECT hackton_id FROM participacao WHERE aluno_id = ?
          )
        ORDER BY h.data_inicio ASC
      `;

      connection.query(sqlHacktonsInscritos, [alunoId], (errInscritos, hacktonsInscritos) => {
        if (errInscritos) {
          console.error('Erro ao buscar hacktons inscritos:', errInscritos);
          return res.status(500).send('Erro ao carregar hacktons.');
        }

        connection.query(sqlDisponiveis, [alunoId], (errDisponiveis, hacktonsDisponiveis) => {
          if (errDisponiveis) {
            console.error('Erro ao buscar hacktons disponíveis:', errDisponiveis);
            return res.status(500).send('Erro ao carregar hacktons disponíveis.');
          }

          const hoje = new Date();

          // Buscar fotos do aluno para flag fotoEnviada
          const sqlFotos = 'SELECT hackton_id FROM foto WHERE aluno_id = ?';
          connection.query(sqlFotos, [alunoId], (errFotos, fotos) => {
            if (errFotos) {
              console.error('Erro ao buscar fotos:', errFotos);
              return res.status(500).send('Erro ao carregar fotos.');
            }

            const hacktonsComFoto = fotos.map(f => f.hackton_id);

            // Agora vamos classificar hacktons inscritos em 2 grupos:
            // - emAndamento: data atual entre início e fim
            // - inscritosEmAberto: hacktons inscritos mas fora do período de andamento

            const emAndamento = [];
            const inscritosEmAberto = [];

            hacktonsInscritos.forEach(h => {
              const dataInicio = new Date(h.data_inicio);
              const dataFim = new Date(h.data_fim);
              const entreDatas = hoje >= dataInicio && hoje <= dataFim;

              h.fotoEnviada = hacktonsComFoto.includes(h.id_hackton);

              if (entreDatas) {
                // Se está entre as datas, status mostrado será "Em Andamento"
                h.statusExibido = 'Em Andamento';
                emAndamento.push(h);
              } else {
                // Fora do período, mostrar como "Inscrito"
                h.statusExibido = 'Inscrito';
                inscritosEmAberto.push(h);
              }
            });

            // Junta todos os hacktons para a aba "Em andamento" que inclui
            // os em andamento + os inscritos fora do período (status "Inscrito")
            const hacktonsParaExibir = [...emAndamento, ...inscritosEmAberto];

            res.render('alunoHacktons', {
              emAndamento: hacktonsParaExibir, // nome da variável para o template (se preferir, mude)
              emAberto: hacktonsDisponiveis
            });
          });
        });
      });
    });
  });
});

app.post('/participar/:idHackton', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }

  const idHackton = req.params.idHackton;
  const email = req.session.user.email_edu;

  // Pega o ID do aluno pelo email
  const sqlAluno = 'SELECT ID_aluno FROM aluno WHERE email_edu = ?';

  connection.query(sqlAluno, [email], (err, alunoResults) => {
    if (err || alunoResults.length === 0) {
      console.error('Erro ao buscar aluno:', err);
      return res.status(500).send('Erro ao buscar aluno.');
    }

    const idAluno = alunoResults[0].ID_aluno;

    // Inserir participação do aluno no hackton
    const sqlInsert = 'INSERT INTO participacao (aluno_id, hackton_id) VALUES (?, ?)';

    connection.query(sqlInsert, [idAluno, idHackton], (insertErr) => {
      if (insertErr) {
        if (insertErr.code === 'ER_DUP_ENTRY') {
          // Já está inscrito, só redireciona
          return res.redirect('/ahacktons');
        }

        console.error('Erro ao registrar participação:', insertErr);
        return res.status(500).send('Erro ao registrar participação.');
      }

      res.redirect('/ahacktons');
    });
  });
});

app.post('/enviar-foto', upload.single('foto'), (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }

  const email = req.session.user.email_edu;

  connection.query('SELECT ID_aluno FROM aluno WHERE email_edu = ?', [email], (err, results) => {
    if (err || results.length === 0) {
      console.error('Erro ao encontrar aluno:', err);
      return res.status(500).send('Erro ao encontrar aluno.');
    }

    const id_aluno = results[0].ID_aluno;
    const { id_hackton } = req.body;
    const foto_path = req.file.filename;
    const data_envio = new Date();

    // Verifica se já existe foto
    const sqlBuscarFoto = 'SELECT id_foto, caminho FROM foto WHERE aluno_id = ? AND hackton_id = ?';

    connection.query(sqlBuscarFoto, [id_aluno, id_hackton], (errBuscar, fotos) => {
      if (errBuscar) {
        console.error('Erro ao buscar foto existente:', errBuscar);
        return res.status(500).send('Erro ao processar foto.');
      }

      if (fotos.length > 0) {
        // Já tem foto enviada - vamos substituir
        const id_foto_antiga = fotos[0].id_foto;
        const caminho_antigo = fotos[0].caminho;

        // Opcional: deletar arquivo antigo do disco, usando fs.unlink (requer import fs)
        /*
        const fs = require('fs');
        const caminhoCompleto = path.join(__dirname, 'uploads', caminho_antigo);
        fs.unlink(caminhoCompleto, (err) => {
          if (err) console.warn('Erro ao deletar arquivo antigo:', err);
        });
        */

        // Atualiza o registro com o novo arquivo e data
        const sqlUpdateFoto = 'UPDATE foto SET caminho = ?, data_envio = ? WHERE id_foto = ?';

        connection.query(sqlUpdateFoto, [foto_path, data_envio, id_foto_antiga], (errUpdate) => {
          if (errUpdate) {
            console.error('Erro ao atualizar foto:', errUpdate);
            return res.status(500).send('Erro ao salvar foto.');
          }

          // Não altera coins para substituição, ou se quiser, pode ajustar aqui

          return res.redirect('/ahacktons');
        });
      } else {
        // Não tem foto - insere nova
        const sqlInsertFoto = 'INSERT INTO foto (aluno_id, hackton_id, caminho, data_envio) VALUES (?, ?, ?, ?)';

        connection.query(sqlInsertFoto, [id_aluno, id_hackton, foto_path, data_envio], (errInsert) => {
          if (errInsert) {
            console.error('Erro ao salvar a foto:', errInsert);
            return res.status(500).send('Erro ao salvar a foto.');
          }

          // Atualiza coins do aluno (+1)
          const sqlUpdateCoins = 'UPDATE aluno SET coins = coins + 1 WHERE ID_aluno = ?';

          connection.query(sqlUpdateCoins, [id_aluno], (errCoins) => {
            if (errCoins) {
              console.error('Erro ao atualizar coins do aluno:', errCoins);
              return res.status(500).send('Erro ao atualizar coins.');
            }

            return res.redirect('/ahacktons');
          });
        });
      }
    });
  });
});

app.get('/pdashboard', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }

  atualizarStatusHacktons((errAtualiza) => {
    if (errAtualiza) {
      console.error('Erro ao atualizar status dos hacktons:', errAtualiza);
      return res.status(500).send('Erro ao atualizar hacktons.');
    }

    const idProf = req.session.user.id_professor;

    const sql = `SELECT * FROM hackton WHERE fk_professor = ? ORDER BY data_inicio ASC`;

    connection.query(sql, [idProf], (err, results) => {
      if (err) {
        console.error('Erro ao buscar hacktons:', err);
        return res.status(500).send('Erro ao carregar hacktons.');
      }

      const emAberto = results.filter(h => h.status === 'Em Aberto');
      const emAndamento = results.filter(h => h.status === 'Em Andamento');
      const encerrados = results.filter(h => h.status === 'Fechado' || h.status === 'Encerrado');

      res.render('professorDashboard', {
        emAberto,
        emAndamento,
        encerrados
      });
    });
  });
});

app.get('/pcadastroh', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }
    res.render('professorCadastroH')
})

app.post('/enviaPCadastroH', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }

  const { nome, dataInscricaoMax, dataInicio, dataFim, local } = req.body;
  const fk_professor = req.session.user.id_professor; // ou id, conforme salvou no login

  const hoje = new Date().toISOString().split('T')[0];
  let status = 'Fechado';

  if (dataInicio > hoje) {
    status = 'Em Aberto';
  } else if (dataFim >= hoje) {
    status = 'Em Andamento';
  }

  const sql = `
    INSERT INTO hackton (nome, data_inscricao_max, data_inicio, data_fim, local, status, fk_professor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [nome, dataInscricaoMax, dataInicio, dataFim, local, status, fk_professor];

  connection.query(sql, values, (error) => {
    if (error) {
      console.error('Erro ao cadastrar hackton:', error);
      return res.status(500).send('Erro ao cadastrar hackton.');
    }

    res.redirect('/pdashboard');
  });
})

app.get('/pvalidarf', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }

  const idProf = req.session.user.id_professor;

  // Buscar hacktons em andamento do professor para validação de fotos
  const sqlHacktonsPendentes = `
    SELECT * FROM hackton
    WHERE fk_professor = ? AND status = 'Em Andamento'
    ORDER BY data_inicio ASC
  `;

  // Buscar hacktons finalizados para exibir
  const sqlHacktonsFinalizados = `
    SELECT * FROM hackton
    WHERE fk_professor = ? AND status = 'Fechado'
    ORDER BY data_inicio ASC
  `;

  connection.query(sqlHacktonsPendentes, [idProf], (errPend, hacktonsPendentes) => {
    if (errPend) {
      console.error('Erro ao buscar hacktons pendentes:', errPend);
      return res.status(500).send('Erro ao carregar hacktons.');
    }

    connection.query(sqlHacktonsFinalizados, [idProf], (errFinal, hacktonsFinalizados) => {
      if (errFinal) {
        console.error('Erro ao buscar hacktons finalizados:', errFinal);
        return res.status(500).send('Erro ao carregar hacktons.');
      }

      // Para cada hackton em andamento, buscar participantes com fotos pendentes
      const promisesPendentes = hacktonsPendentes.map(hackton => {
        return new Promise((resolve, reject) => {
          const sqlParticipantesPendentes = `
            SELECT 
              f.id_foto,
              a.ID_aluno as id_aluno,
              a.nome as nome_aluno,
              a.email_edu,
              f.caminho,
              f.data_envio
            FROM foto f
            INNER JOIN aluno a ON f.aluno_id = a.ID_aluno
            WHERE f.hackton_id = ?
            ORDER BY f.data_envio DESC
          `;
          connection.query(sqlParticipantesPendentes, [hackton.id_hackton], (err2, participantes) => {
            if (err2) return reject(err2);
            hackton.participantes = participantes;
            resolve();
          });
        });
      });

      // Para cada hackton finalizado, buscar participantes (simplificado)
      const promisesFinalizados = hacktonsFinalizados.map(hackton => {
        return new Promise((resolve, reject) => {
          const sqlParticipantesFinalizados = `
            SELECT 
              a.nome as nome_aluno,
              a.email_edu
            FROM participacao p
            INNER JOIN aluno a ON p.aluno_id = a.ID_aluno
            WHERE p.hackton_id = ?
          `;
          connection.query(sqlParticipantesFinalizados, [hackton.id_hackton], (err3, participantes) => {
            if (err3) return reject(err3);
            hackton.participantes = participantes;
            resolve();
          });
        });
      });

      Promise.all([...promisesPendentes, ...promisesFinalizados])
        .then(() => {
          res.render('professorValidarFoto', {
            hacktonsPendentes,
            hacktonsFinalizados
          });
        })
        .catch(error => {
          console.error('Erro ao buscar participantes:', error);
          res.status(500).send('Erro ao carregar participantes.');
        });
    });
  });
});

app.post('/rejeitar-foto', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }

  const { id_foto, id_aluno } = req.body;

  if (!id_foto || !id_aluno) {
    return res.status(400).send('Dados inválidos.');
  }

  connection.beginTransaction(err => {
    if (err) {
      console.error('Erro na transação:', err);
      return res.status(500).send('Erro no servidor.');
    }

    // Apagar foto rejeitada
    connection.query('DELETE FROM foto WHERE id_foto = ?', [id_foto], (errDel) => {
      if (errDel) {
        return connection.rollback(() => {
          console.error('Erro ao deletar foto:', errDel);
          res.status(500).send('Erro ao rejeitar foto.');
        });
      }

      // Decrementar coin do aluno (sem ficar negativo)
      const sqlCoins = `
        UPDATE aluno
        SET coins = GREATEST(coins - 1, 0)
        WHERE ID_aluno = ?
      `;

      connection.query(sqlCoins, [id_aluno], (errUpd) => {
        if (errUpd) {
          return connection.rollback(() => {
            console.error('Erro ao atualizar coins:', errUpd);
            res.status(500).send('Erro ao rejeitar foto.');
          });
        }

        connection.commit(errCommit => {
          if (errCommit) {
            return connection.rollback(() => {
              console.error('Erro ao finalizar transação:', errCommit);
              res.status(500).send('Erro ao rejeitar foto.');
            });
          }

          res.redirect('/pvalidarf');
        });
      });
    });
  });
});

app.post('/finalizar-hackton/:idHackton', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }

  const idHackton = req.params.idHackton;
  // atualiza status para 'Encerrado' ou 'Fechado'
  const sql = `
    UPDATE hackton
    SET status = 'Fechado'
    WHERE id_hackton = ?
  `;

  connection.query(sql, [idHackton], (err) => {
    if (err) {
      console.error('Erro ao encerrar hackton:', err);
      return res.status(500).send('Erro ao finalizar hackton.');
    }
    // volta para a tela de validação
    res.redirect('/pvalidarf');
  });
});

app.get('/profile', (req, res) => {
  if (!req.session.user || (req.session.user.perfil !== 'professor' && req.session.user.perfil !== 'aluno')) {
    return res.redirect('/');
  }
    res.render('profile');
})
