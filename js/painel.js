/**
 * Painel Vion Player - Firebase Integration (Compat Mode)
 */

const firebaseConfig = {
    apiKey: "AIzaSyCnkBupjz-FzYoFhHcUpnQYZ7_Wra12zh4",
    authDomain: "vion-player.firebaseapp.com",
    projectId: "vion-player",
    storageBucket: "vion-player.firebasestorage.app",
    messagingSenderId: "151686081759",
    appId: "1:151686081759:web:178d6825400653f290cd6a"
};

// Inicializa Firebase Compat
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const Painel = {
    db: {
        users: [],
        listas: [],
        clientes: []
    },
    
    loggedUser: null,
    isSyncing: false,

    init() {
        this.bindEvents();
        
        const session = localStorage.getItem('vion_logged_user');
        if (session) {
            this.loggedUser = JSON.parse(session);
            this.showDashboard(); // Mantém logado na tela de imediato
        } else {
            this.showLogin();
        }

        this.startSync();
    },

    async startSync() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        // GARANTIA: Se o banco estiver vazio, cria o seu login master automaticamente
        try {
            const adminRef = db.collection("users").doc("admin-1");
            const adminSnap = await adminRef.get();
            
            if (!adminSnap.exists) {
                await adminRef.set({ 
                    username: '142532', 
                    password: 'k9joao', 
                    role: 'admin', 
                    nome: 'Dono (Master)', 
                    ownerId: null 
                });
            }
        } catch(e) {
            console.error("Erro ao verificar admin:", e);
        }

        // Sincroniza USUÁRIOS (Revendas e Master)
        db.collection("users").onSnapshot((snap) => {
            // Proteção contra o primeiro load vazio do Firebase (cache falso)
            if (snap.empty && snap.metadata.fromCache) return; 

            this.db.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            if (this.loggedUser && !this.db.users.find(u => u.id === this.loggedUser.id)) {
                this.logout();
                return;
            }

            if (this.loggedUser) {
                const dbUser = this.db.users.find(u => u.id === this.loggedUser.id);
                this.loggedUser = dbUser;
                localStorage.setItem('vion_logged_user', JSON.stringify(dbUser));
                this.renderRevendedores();
            }
        });

        // Sincroniza LISTAS
        db.collection("listas").onSnapshot((snap) => {
            this.db.listas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (this.loggedUser) {
                this.renderListas();
                this.renderClientes();
                this.populateListSelects();
            }
        });

        // Sincroniza CLIENTES (MACs)
        db.collection("clientes").onSnapshot((snap) => {
            this.db.clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (this.loggedUser) {
                this.renderListas(); 
                this.renderClientes();
            }
        });
    },

    bindEvents() {
        // Login
        document.getElementById('form-login').addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('login-usuario').value;
            const p = document.getElementById('login-senha').value;
            
            const user = this.db.users.find(usr => usr.username === u && usr.password === p);
            
            if (user) {
                this.loggedUser = user;
                localStorage.setItem('vion_logged_user', JSON.stringify(user));
                document.getElementById('login-error').classList.add('hidden-view');
                document.getElementById('login-usuario').value = '';
                document.getElementById('login-senha').value = '';
                this.showDashboard();
            } else {
                // Se a lista de users ainda estiver vazia (carregando), dá um alerta.
                if (this.db.users.length === 0) {
                    alert("Ainda conectando ao banco de dados... Aguarde 2 segundos e tente de novo.");
                } else {
                    document.getElementById('login-error').classList.remove('hidden-view');
                }
            }
        });

        // Forms Actions
        document.getElementById('form-add-cliente').addEventListener('submit', (e) => { e.preventDefault(); this.addCliente(); });
        document.getElementById('form-add-lista').addEventListener('submit', (e) => { e.preventDefault(); this.saveLista(); });
        document.getElementById('form-acao-massa').addEventListener('submit', (e) => { e.preventDefault(); this.applyMassa(); });
        document.getElementById('form-add-revenda').addEventListener('submit', (e) => { e.preventDefault(); this.addRevenda(); });

        // Formatar MAC
        const macInput = document.getElementById('add-cli-mac');
        if(macInput) {
            macInput.addEventListener('input', function(e) {
                let v = e.target.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
                let f = '';
                for (let i = 0; i < v.length; i++) {
                    if (i > 0 && i % 2 === 0) f += ':';
                    f += v[i];
                }
                e.target.value = f.substring(0, 17);
            });
        }
    },

    // ===== NAVEGAÇÃO E UI =====

    showLogin() {
        document.getElementById('login-view').classList.remove('hidden-view');
        document.getElementById('dashboard-view').classList.add('hidden-view');
    },

    showDashboard() {
        document.getElementById('login-view').classList.add('hidden-view');
        document.getElementById('dashboard-view').classList.remove('hidden-view');
        
        const badge = document.getElementById('user-role-badge');
        const tabRevendedores = document.getElementById('tab-revendedores');

        if (this.loggedUser.role === 'admin') {
            badge.textContent = 'Admin Master';
            badge.className = 'mt-2 bg-red-900/50 text-red-400 px-3 py-1 rounded-full border border-red-800 text-xs font-bold uppercase tracking-wide';
            tabRevendedores.classList.remove('hidden-view');
        } else if (this.loggedUser.role === 'master') {
            badge.textContent = 'Revenda Master';
            badge.className = 'mt-2 bg-purple-900/50 text-purple-400 px-3 py-1 rounded-full border border-purple-800 text-xs font-bold uppercase tracking-wide';
            tabRevendedores.classList.remove('hidden-view');
        } else {
            badge.textContent = 'Revenda Comum';
            badge.className = 'mt-2 bg-blue-900/50 text-blue-400 px-3 py-1 rounded-full border border-blue-800 text-xs font-bold uppercase tracking-wide';
            tabRevendedores.classList.add('hidden-view');
        }

        if(document.getElementById('view-clientes').classList.contains('hidden-view') && 
           document.getElementById('view-listas').classList.contains('hidden-view') &&
           document.getElementById('view-revendedores').classList.contains('hidden-view')) {
               this.switchTab('clientes');
        }
    },

    logout() {
        this.loggedUser = null;
        localStorage.removeItem('vion_logged_user');
        this.showLogin();
    },

    switchTab(tab) {
        document.getElementById('view-clientes').classList.add('hidden-view');
        document.getElementById('view-listas').classList.add('hidden-view');
        document.getElementById('view-revendedores').classList.add('hidden-view');
        
        const tabs = ['clientes', 'listas', 'revendedores'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            if(btn) {
                btn.classList.remove('bg-blue-600/10', 'text-blue-500');
                btn.classList.add('text-gray-400');
            }
        });

        document.getElementById(`view-${tab}`).classList.remove('hidden-view');
        document.getElementById(`tab-${tab}`).classList.add('bg-blue-600/10', 'text-blue-500');
        document.getElementById(`tab-${tab}`).classList.remove('text-gray-400');

        if (tab === 'clientes') this.renderClientes();
        if (tab === 'listas') this.renderListas();
        if (tab === 'revendedores') this.renderRevendedores();
    },

    showModal(id) {
        document.getElementById(id).classList.remove('hidden-view');
        
        if (id === 'modal-add-cliente' || id === 'modal-acao-massa') {
            this.populateListSelects();
        }
        
        if (id === 'modal-add-revenda') {
            const roleSelect = document.getElementById('add-rev-role');
            if (this.loggedUser.role === 'admin') {
                roleSelect.innerHTML = `
                    <option value="master">Revenda Master (Pode criar outras revendas)</option>
                    <option value="revenda">Revenda Comum (Somente gerencia clientes)</option>
                `;
            } else if (this.loggedUser.role === 'master') {
                roleSelect.innerHTML = `
                    <option value="revenda">Revenda Comum (Somente gerencia clientes)</option>
                `;
            }
        }

        if (id === 'modal-acao-massa') {
            const contagem = document.querySelectorAll('.check-cliente:checked').length;
            document.getElementById('massa-count').textContent = contagem;
            if(contagem === 0) {
                alert('Selecione pelo menos um cliente na tabela primeiro!');
                this.hideModal('modal-acao-massa');
            }
        }
    },

    hideModal(id) {
        document.getElementById(id).classList.add('hidden-view');
        if (id === 'modal-add-lista') {
            document.getElementById('form-add-lista').reset();
            document.getElementById('edit-lista-id').value = '';
        }
        if (id === 'modal-add-cliente') document.getElementById('form-add-cliente').reset();
        if (id === 'modal-add-revenda') document.getElementById('form-add-revenda').reset();
    },

    // ===== FILTROS MULTI-TENANT =====

    getVisibleListas() {
        if (!this.loggedUser) return [];
        if (this.loggedUser.role === 'admin') return this.db.listas;
        return this.db.listas.filter(l => l.ownerId === this.loggedUser.id);
    },

    getVisibleClientes() {
        if (!this.loggedUser) return [];
        if (this.loggedUser.role === 'admin') return this.db.clientes;
        return this.db.clientes.filter(c => c.ownerId === this.loggedUser.id);
    },

    // ===== RENDERIZAÇÃO NA TELA =====

    renderListas() {
        const grid = document.getElementById('grid-listas');
        if(!grid) return;
        grid.innerHTML = '';
        const visibleListas = this.getVisibleListas();

        if (visibleListas.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10">Nenhuma lista encontrada. Crie uma para começar.</div>`;
            return;
        }

        visibleListas.forEach(lst => {
            const qtd = this.db.clientes.filter(c => c.listaId === lst.id).length;
            const owner = this.db.users.find(u => u.id === lst.ownerId);
            const ownerName = owner ? owner.nome : 'Desconhecido';
            
            let ownerBadge = '';
            if (this.loggedUser.role === 'admin') {
                ownerBadge = `<div class="text-xs text-gray-500 mt-1"><i class="fa-solid fa-user-tie"></i> Revenda: ${ownerName}</div>`;
            }

            grid.innerHTML += `
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col relative overflow-hidden group hover:border-blue-500/50 transition-colors">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h3 class="text-lg font-bold text-white mb-1">${lst.nome}</h3>
                            <span class="bg-blue-900/40 text-blue-400 text-xs px-2 py-1 rounded font-medium">${qtd} clientes vinculados</span>
                            ${ownerBadge}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="Painel.editLista('${lst.id}')" class="text-gray-400 hover:text-white p-1" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="Painel.deleteLista('${lst.id}')" class="text-gray-400 hover:text-red-500 p-1" title="Apagar"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="bg-gray-950 border border-gray-800 rounded p-3 text-xs text-gray-500 break-all mt-auto">
                        <i class="fa-solid fa-link mr-1"></i> ${lst.url}
                    </div>
                </div>
            `;
        });
    },

    renderClientes() {
        const tbody = document.getElementById('tabela-clientes-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        const visibleClientes = this.getVisibleClientes();
        const today = new Date().toISOString().split('T')[0];

        if (visibleClientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500">Nenhum cliente encontrado.</td></tr>`;
            return;
        }

        visibleClientes.forEach(cli => {
            const lst = this.db.listas.find(l => l.id === cli.listaId);
            const lstNome = lst ? lst.nome : '<span class="text-red-500">Sem Lista</span>';
            const isVencido = cli.vencimento < today;
            
            const owner = this.db.users.find(u => u.id === cli.ownerId);
            const ownerName = owner ? owner.nome : '-';
            const ownerTd = this.loggedUser.role === 'admin' ? `<td class="px-6 py-4 text-gray-500">${ownerName}</td>` : '<td class="px-6 py-4 text-gray-500">Você</td>';

            tbody.innerHTML += `
                <tr class="hover:bg-gray-800/50 transition-colors">
                    <td class="p-4">
                        <input type="checkbox" value="${cli.id}" class="check-cliente w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500">
                    </td>
                    <td class="px-6 py-4 font-mono text-white">${cli.mac}</td>
                    <td class="px-6 py-4">${cli.nome}</td>
                    <td class="px-6 py-4"><span class="bg-gray-800 px-2 py-1 rounded text-xs border border-gray-700">${lstNome}</span></td>
                    ${ownerTd}
                    <td class="px-6 py-4">
                        <span class="${isVencido ? 'text-red-500 font-bold' : 'text-green-500'}">
                            ${this.formatDate(cli.vencimento)}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="Painel.deleteCliente('${cli.id}')" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    },

    renderRevendedores() {
        const tbody = document.getElementById('tabela-revendedores-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        if (!this.loggedUser || this.loggedUser.role === 'revenda') return;

        let revendedores = [];
        if (this.loggedUser.role === 'admin') {
            revendedores = this.db.users.filter(u => u.role === 'master' || u.role === 'revenda');
        } else if (this.loggedUser.role === 'master') {
            revendedores = this.db.users.filter(u => u.ownerId === this.loggedUser.id);
        }

        if (revendedores.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhum membro da equipe encontrado.</td></tr>`;
            return;
        }

        revendedores.forEach(rev => {
            const qtdClientes = this.db.clientes.filter(c => c.ownerId === rev.id).length;
            const badgeRole = rev.role === 'master' ? '<span class="text-purple-400">Revenda Master</span>' : '<span class="text-blue-400">Revenda Comum</span>';
            const createdBy = this.db.users.find(u => u.id === rev.ownerId);
            const creatorName = createdBy ? createdBy.nome : 'Dono do Painel';

            tbody.innerHTML += `
                <tr class="hover:bg-gray-800/50 transition-colors">
                    <td class="px-6 py-4 font-mono text-white">${rev.username}</td>
                    <td class="px-6 py-4">${rev.nome}</td>
                    <td class="px-6 py-4 font-semibold">${badgeRole}</td>
                    <td class="px-6 py-4"><span class="bg-blue-900/40 text-blue-400 px-2 py-1 rounded">${qtdClientes}</span></td>
                    <td class="px-6 py-4 text-gray-500">${creatorName}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="Painel.deleteRevenda('${rev.id}')" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    },

    populateListSelects() {
        const sAdd = document.getElementById('add-cli-lista');
        const sMassa = document.getElementById('massa-lista-nova');
        let opts = '<option value="">-- Selecione a Lista --</option>';
        
        const visibleListas = this.getVisibleListas();
        visibleListas.forEach(lst => {
            opts += `<option value="${lst.id}">${lst.nome}</option>`;
        });

        if(sAdd) sAdd.innerHTML = opts;
        if(sMassa) sMassa.innerHTML = opts;
    },

    formatDate(dateStr) {
        if(!dateStr) return '-';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    },

    // ===== FIREBASE CRUD ACTIONS =====

    async addCliente() {
        const mac = document.getElementById('add-cli-mac').value.toUpperCase();
        const nome = document.getElementById('add-cli-nome').value;
        const listaId = document.getElementById('add-cli-lista').value;
        const vencimento = document.getElementById('add-cli-vencimento').value;

        const cleanMac = mac.replace(/:/g, '');

        if (this.db.clientes.find(c => c.id === cleanMac)) {
            alert('Esse MAC já está cadastrado no sistema!');
            return;
        }

        try {
            await db.collection("clientes").doc(cleanMac).set({ 
                mac: mac, 
                nome, 
                listaId, 
                vencimento,
                ownerId: this.loggedUser.id
            });
            this.hideModal('modal-add-cliente');
        } catch(e) {
            alert("Erro ao adicionar cliente. Tente novamente.");
            console.error(e);
        }
    },

    async deleteCliente(id) {
        const cli = this.db.clientes.find(c => c.id === id);
        if (!cli) return;
        if (this.loggedUser.role !== 'admin' && cli.ownerId !== this.loggedUser.id) {
            alert('Você não tem permissão para apagar este cliente.');
            return;
        }

        if(confirm(`Tem certeza que deseja apagar o cliente MAC: ${cli.mac}?`)) {
            await db.collection("clientes").doc(id).delete();
        }
    },

    async saveLista() {
        const id = document.getElementById('edit-lista-id').value;
        const nome = document.getElementById('add-lst-nome').value;
        const url = document.getElementById('add-lst-url').value;

        try {
            if (id) {
                const lst = this.db.listas.find(l => l.id === id);
                if(lst && (this.loggedUser.role === 'admin' || lst.ownerId === this.loggedUser.id)) {
                    await db.collection("listas").doc(id).update({ nome, url });
                }
            } else {
                await db.collection("listas").add({ 
                    nome, 
                    url, 
                    ownerId: this.loggedUser.id
                });
            }
            this.hideModal('modal-add-lista');
        } catch(e) {
            alert("Erro ao salvar lista. Tente novamente.");
            console.error(e);
        }
    },

    editLista(id) {
        const lst = this.db.listas.find(l => l.id === id);
        if(!lst) return;
        if (this.loggedUser.role !== 'admin' && lst.ownerId !== this.loggedUser.id) {
            alert('Sem permissão para editar essa lista.');
            return;
        }
        
        document.getElementById('edit-lista-id').value = lst.id;
        document.getElementById('add-lst-nome').value = lst.nome;
        document.getElementById('add-lst-url').value = lst.url;
        this.showModal('modal-add-lista');
    },

    async deleteLista(id) {
        if (this.db.clientes.find(c => c.listaId === id)) {
            alert('Você não pode apagar uma lista que possui clientes vinculados. Troque a lista dos clientes primeiro.');
            return;
        }
        if(confirm('Tem certeza que deseja apagar essa lista?')) {
            await db.collection("listas").doc(id).delete();
        }
    },

    toggleAllChecks(el) {
        const boxes = document.querySelectorAll('.check-cliente');
        boxes.forEach(b => b.checked = el.checked);
    },

    async applyMassa() {
        const newListaId = document.getElementById('massa-lista-nova').value;
        if(!newListaId) return;

        const checks = document.querySelectorAll('.check-cliente:checked');
        const idsSelecionados = Array.from(checks).map(b => b.value);

        if(idsSelecionados.length === 0) return;

        try {
            for (let id of idsSelecionados) {
                const cli = this.db.clientes.find(c => c.id === id);
                if (cli && (this.loggedUser.role === 'admin' || cli.ownerId === this.loggedUser.id)) {
                    await db.collection("clientes").doc(id).update({ listaId: newListaId });
                }
            }
            this.hideModal('modal-acao-massa');
            document.getElementById('check-all').checked = false;
            alert(`${idsSelecionados.length} clientes atualizados com sucesso para o novo servidor!`);
        } catch(e) {
            alert("Erro ao executar ação em massa.");
            console.error(e);
        }
    },

    async addRevenda() {
        if (this.loggedUser.role === 'revenda') return;

        const role = document.getElementById('add-rev-role').value;
        const username = document.getElementById('add-rev-user').value;
        const nome = document.getElementById('add-rev-nome').value;
        const password = document.getElementById('add-rev-senha').value;

        if (this.db.users.find(u => u.username === username)) {
            alert('Esse usuário já existe no sistema!');
            return;
        }

        try {
            await db.collection("users").add({ 
                username, 
                nome, 
                password, 
                role: role,
                ownerId: this.loggedUser.id 
            });
            this.hideModal('modal-add-revenda');
            alert(`Conta de ${role === 'master' ? 'Revenda Master' : 'Revenda Comum'} criada com sucesso!`);
        } catch(e) {
            alert("Erro ao criar conta.");
            console.error(e);
        }
    },

    async deleteRevenda(id) {
        const userToDel = this.db.users.find(u => u.id === id);
        if (!userToDel) return;
        if (this.loggedUser.role !== 'admin' && userToDel.ownerId !== this.loggedUser.id) {
            alert('Você não tem permissão para apagar este usuário.');
            return;
        }
        
        if (this.db.users.find(u => u.ownerId === id)) {
            alert('Não é possível apagar esta Revenda Master pois ela possui revendedores subordinados. Delete as sub-revendas primeiro.');
            return;
        }

        if (this.db.clientes.find(c => c.ownerId === id)) {
            alert('Não é possível apagar esta revenda, pois ela possui clientes cadastrados! Delete os clientes antes.');
            return;
        }
        
        if (confirm('Tem certeza que deseja remover esta conta de revendedor?')) {
            await db.collection("users").doc(id).delete();
        }
    }
};

window.Painel = Painel;
document.addEventListener('DOMContentLoaded', () => { Painel.init(); });
