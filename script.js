// --- CONFIGURACIÓN DE SEGURIDAD ---
if (sessionStorage.getItem('acceso_vane') !== 'autorizado') {
    window.location.href = 'pin.html';
}

function cerrarSesion() {
    sessionStorage.removeItem('acceso_vane');
    sessionStorage.clear();
    window.location.href = 'pin.html';
}

// --- CONFIGURACIÓN INICIAL ---
let productos = [];
let carrito = [];
let todasLasVentas = [];
let streamActual = null;
let editandoID = null;
let idParaEliminar = null;
let accionPendiente = null;

// Elementos del DOM
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const imgPreview = document.getElementById('img-preview');

// --- 1. SINCRONIZACIÓN EN TIEMPO REAL (FIREBASE) ---
db.ref('productos').on('value', (snapshot) => {
    const data = snapshot.val();
    const nuevos = [];
    if (data) {
        Object.keys(data).forEach(key => {
            nuevos.push({ id: key, ...data[key] });
        });
    }
    // Solo re-renderizar si algo cambió de verdad
    if (JSON.stringify(nuevos) !== JSON.stringify(productos)) {
        productos = nuevos;
        const secPos = document.getElementById('sec-pos');
        if (secPos && secPos.style.display !== 'none') {
            renderTienda();
        }
    }
});

// --- NOTIFICACIONES ---
function mostrarNotificacion(mensaje) {
    const toast = document.createElement('div');
    toast.className = 'toast-vane';
    toast.innerHTML = `<span>✨</span> ${mensaje}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ============================================================
//  ESCÁNER DE CÓDIGO DE BARRAS
// ============================================================

let modoEscaner    = 'ventas';
let streamEscaner  = null;
let scanLoop       = null;
let scannerAbierto = false;

function abrirEscaner() {
    modoEscaner = 'ventas';
    _iniciarEscaner();
}

function abrirEscanerRegistro() {
    modoEscaner = 'registro';
    _iniciarEscaner();
}

async function _iniciarEscaner() {
    if (scannerAbierto) return;
    scannerAbierto = true;

    document.getElementById('scanner-overlay').style.display = 'flex';

    const videoEl = document.getElementById('scanner-video');

    // Pedir cámara
    try {
        streamEscaner = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl.srcObject = streamEscaner;
        videoEl.play();
    } catch(err) {
        mostrarNotificacion('⚠️ Sin acceso a cámara: ' + err.message);
        cerrarEscaner();
        return;
    }

    // Esperar que el video cargue
    await new Promise(res => {
        videoEl.onloadedmetadata = () => res();
        setTimeout(res, 2000); // timeout fallback
    });

    const motor = 'BarcodeDetector' in window ? '⚡ Motor: BarcodeDetector (nativo)' : '⚡ Motor: ZXing (fallback)';
    console.log('📷 Cámara activa.', motor);
    const engineEl = document.getElementById('scanner-engine');
    if (engineEl) engineEl.textContent = motor;

    // Elegir motor de lectura
    if ('BarcodeDetector' in window) {
        _leerConBarcodeDetector(videoEl);
    } else {
        _leerConZXing(videoEl);
    }
}

// ── MOTOR 1: BarcodeDetector (nativo Chrome, el más confiable) ──
async function _leerConBarcodeDetector(videoEl) {
    const detector = new BarcodeDetector({
        formats: ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','qr_code','itf','codabar']
    });

    async function tick() {
        if (!scannerAbierto) return;
        try {
            const codes = await detector.detect(videoEl);
            if (codes.length > 0) {
                const codigo = codes[0].rawValue.trim();
                console.log('✅ BarcodeDetector:', codigo);
                _codigoDetectado(codigo);
                return;
            }
        } catch(e) { /* frame sin código, normal */ }
        scanLoop = requestAnimationFrame(tick);
    }
    scanLoop = requestAnimationFrame(tick);
}

// ── MOTOR 2: ZXing fallback ──
function _leerConZXing(videoEl) {
    const capCanvas = document.createElement('canvas');
    const capCtx    = capCanvas.getContext('2d');
    let   codeReader;

    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        codeReader.decodeFromConstraints(
            { video: { facingMode: 'environment' } },
            'scanner-video',
            (result, err) => {
                if (!scannerAbierto) return;
                if (result) {
                    const codigo = result.getText().trim();
                    console.log('✅ ZXing:', codigo);
                    _codigoDetectado(codigo);
                }
            }
        );
        // Guardar ref para poder parar
        window._zxingInstance = codeReader;
    } catch(e) {
        mostrarNotificacion('⚠️ Error al iniciar lector: ' + e.message);
        cerrarEscaner();
    }
}

// ── Código detectado: acción según modo ──
function _codigoDetectado(codigo) {
    if (!scannerAbierto) return;
    if (navigator.vibrate) navigator.vibrate([120]);
    cerrarEscaner();

    if (modoEscaner === 'registro') {
        const campo = document.getElementById('prod-codigo');
        campo.value = codigo;
        campo.style.border    = '2px solid #2ed573';
        campo.style.boxShadow = '0 0 0 3px rgba(46,213,115,0.3)';
        mostrarNotificacion('✅ Código capturado: ' + codigo);
        setTimeout(() => {
            document.getElementById('prod-nombre').focus();
            campo.style.border    = '';
            campo.style.boxShadow = '';
        }, 900);
    } else {
        const buscador = document.getElementById('pos-search');
        buscador.value = codigo;
        filtrarPOS(codigo);
    }
}

function cerrarEscaner() {
    scannerAbierto = false;

    if (scanLoop) { cancelAnimationFrame(scanLoop); scanLoop = null; }

    if (window._zxingInstance) {
        try { window._zxingInstance.reset(); } catch(e) {}
        window._zxingInstance = null;
    }

    if (streamEscaner) {
        streamEscaner.getTracks().forEach(t => t.stop());
        streamEscaner = null;
    }

    const videoEl = document.getElementById('scanner-video');
    if (videoEl) videoEl.srcObject = null;

    const overlay = document.getElementById('scanner-overlay');
    if (overlay) overlay.style.display = 'none';

    setTimeout(() => {
        const el = modoEscaner === 'registro'
            ? document.getElementById('prod-codigo')
            : document.getElementById('pos-search');
        if (el) el.focus();
    }, 150);
}

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('scanner-overlay');
    if (overlay) overlay.addEventListener('click', e => {
        if (e.target === overlay) cerrarEscaner();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && scannerAbierto) cerrarEscaner();
    });
});


// ============================================================
//  CÁMARA PARA FOTOS DE PRODUCTOS (código original sin cambios)
// ============================================================

async function iniciarCamara() {
    if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
    }
    try {
        const constraints = {
            video: {
                facingMode: 'environment',
                width:  { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        streamActual = await navigator.mediaDevices.getUserMedia(constraints);
        if (video) {
            video.srcObject = streamActual;
            video.onloadedmetadata = () => {
                video.play();
                video.style.display = 'block';
            };
            imgPreview.style.display = 'none';
            const wrapper = document.getElementById('wrapper-preview');
            if (wrapper) wrapper.style.display = 'none';
        }
    } catch (err) {
        console.error('Error de cámara:', err);
        if (err.name === 'NotAllowedError') {
            mostrarNotificacion('⚠️ Permiso denegado. Activa la cámara en los ajustes del navegador.');
        } else {
            mostrarNotificacion('⚠️ No se detectó ninguna cámara activa.');
        }
    }
}

function tomarFoto() {
    if (!video || video.paused) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    imgPreview.src = canvas.toDataURL('image/png');
    imgPreview.style.display = 'block';
    video.style.display = 'none';
    const wrapper = document.getElementById('wrapper-preview');
    if (wrapper) wrapper.style.display = 'block';
}

function cargarImagenDesdeArchivo(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            imgPreview.src = e.target.result;
            imgPreview.style.display = 'block';
            video.style.display = 'none';
            const wrapper = document.getElementById('wrapper-preview');
            if (wrapper) wrapper.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function borrarFotoActual() {
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    const wrapper = document.getElementById('wrapper-preview');
    if (wrapper) wrapper.style.display = 'none';
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    video.style.display = 'block';
    iniciarCamara();
}

// --- NAVEGACIÓN ENTRE SECCIONES ---
function mostrarSeccion(id) {
    ['sec-pos','sec-registro','sec-historial'].forEach(s => {
        const el = document.getElementById(s);
        if (!el) return;
        const activo = s === 'sec-' + id;
        if (activo) {
            el.style.display = s === 'sec-pos' ? 'flex' : 'flex';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 0.18s ease';
                el.style.opacity    = '1';
            });
        } else {
            el.style.display = 'none';
            el.style.opacity = '1';
        }
    });

    if (id === 'registro') {
        _detenerEscanerSilencioso();
        iniciarCamara();
    } else {
        if (streamActual) {
            streamActual.getTracks().forEach(track => track.stop());
            streamActual = null;
        }
    }
    if (id !== 'pos') {
        _detenerEscanerSilencioso();
    }

    if (id === 'pos') {
        editandoID = null;
        limpiarFormularioRegistro();
        renderTienda();
        setTimeout(() => {
            const search = document.getElementById('pos-search');
            if (search) search.focus();
            // Arrancar escáner automáticamente en modo silencioso
            _arrancarEscanerSilencioso();
        }, 400);
    }
}

// --- GUARDAR Y EDITAR ---
function guardarLocal() {
    const p = {
        codigo: document.getElementById('prod-codigo').value,
        nombre: document.getElementById('prod-nombre').value,
        precio: parseFloat(document.getElementById('prod-precio').value),
        stock:  parseInt(document.getElementById('prod-stock').value) || 0,
        foto:   imgPreview.src
    };

    if (!p.nombre || isNaN(p.precio) || !p.foto || imgPreview.src === '') {
        return mostrarNotificacion('Faltan datos o la foto');
    }

    if (editandoID) {
        db.ref('productos/' + editandoID).set(p)
            .then(() => {
                mostrarNotificacion('✅ Producto actualizado');
                limpiarFormularioRegistro();
                mostrarSeccion('pos');
            });
    } else {
        db.ref('productos').push(p)
            .then(() => {
                mostrarNotificacion('☁️ Guardado en la nube');
                limpiarFormularioRegistro();
                mostrarSeccion('pos');
            });
    }
}

function limpiarFormularioRegistro() {
    editandoID = null;
    document.getElementById('prod-codigo').value  = '';
    document.getElementById('prod-nombre').value  = '';
    document.getElementById('prod-precio').value  = '';
    document.getElementById('prod-stock').value   = '';
    borrarFotoActual();
    const btn = document.querySelector('.btn-guardar-prod');
    if (btn) btn.innerText = 'GUARDAR EN INVENTARIO';
}

function prepararEdicion(id, event) {
    event.stopPropagation();
    const p = productos.find(prod => prod.id === id);
    if (!p) return;
    editandoID = id;
    mostrarSeccion('registro');
    document.getElementById('prod-codigo').value  = p.codigo;
    document.getElementById('prod-nombre').value  = p.nombre;
    document.getElementById('prod-precio').value  = p.precio;
    document.getElementById('prod-stock').value   = p.stock;
    imgPreview.src = p.foto;
    imgPreview.style.display = 'block';
    video.style.display = 'none';
    document.getElementById('wrapper-preview').style.display = 'block';
    document.querySelector('.btn-guardar-prod').innerText = 'ACTUALIZAR PRODUCTO';
}

// --- MODAL DE CONFIRMACIÓN ---
function eliminarProducto(id, event) {
    event.stopPropagation();
    idParaEliminar = id;
    accionPendiente = 'producto';
    document.getElementById('modal-titulo').innerText  = '¿Eliminar producto?';
    document.getElementById('modal-mensaje').innerText = '¿Seguro(a) que quieres eliminar este producto?';
    document.getElementById('modal-confirmacion').style.display = 'flex';
}

function limpiarHistorialTotal() {
    accionPendiente = 'historial';
    document.getElementById('modal-titulo').innerText  = '¿Vaciar historial?';
    document.getElementById('modal-mensaje').innerText = '¿Seguro(a) que quieres borrar todo el registro de ventas? Esta acción es permanente.';
    document.getElementById('modal-confirmacion').style.display = 'flex';
}

function prepararEliminarVenta(id, event) {
    event.stopPropagation();
    idParaEliminar = id;
    accionPendiente = 'venta_individual';
    document.getElementById('modal-titulo').innerText  = '¿Eliminar esta venta?';
    document.getElementById('modal-mensaje').innerText = 'Se borrará este registro permanentemente.';
    document.getElementById('modal-confirmacion').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modal-confirmacion').style.display = 'none';
    idParaEliminar  = null;
    accionPendiente = null;
}

document.getElementById('btn-confirmar-accion').onclick = function () {
    if (accionPendiente === 'producto' && idParaEliminar) {
        db.ref('productos/' + idParaEliminar).remove()
            .then(() => { mostrarNotificacion('🗑️ Producto eliminado'); cerrarModal(); });
    } else if (accionPendiente === 'historial') {
        db.ref('ventas').remove()
            .then(() => { mostrarNotificacion('🗑️ Historial vaciado'); cerrarModal(); });
    } else if (accionPendiente === 'venta_individual' && idParaEliminar) {
        db.ref('ventas/' + idParaEliminar).remove()
            .then(() => { mostrarNotificacion('🗑️ Venta eliminada'); cerrarModal(); });
    }
};

// --- RENDERIZADO TIENDA ---
function renderTienda(filtro) {
    const grid = document.getElementById('grid-productos');
    if (!grid) return;

    const lista = filtro
        ? productos.filter(p =>
            p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
            p.codigo.includes(filtro))
        : productos;

    // DocumentFragment: un solo reflow en vez de uno por producto
    const frag = document.createDocumentFragment();
    lista.forEach(p => {
        const stockColor = p.stock <= 5 ? 'red' : '#666';
        const div = document.createElement('div');
        div.className = 'card-producto';
        div.onclick = () => agregarCarrito(p.id);
        div.innerHTML = `
            <div class="admin-btns">
                <button onclick="prepararEdicion('${p.id}', event)" class="btn-edit-prod">✏️</button>
                <button onclick="eliminarProducto('${p.id}', event)" class="btn-delete-prod">🗑️</button>
            </div>
            <img src="${p.foto}" loading="lazy">
            <h4>${p.nombre}</h4>
            <p>S/ ${p.precio.toFixed(2)}</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <small style="color:#999;">${p.codigo}</small>
                <small style="background:#f1f2f6; padding:2px 8px; border-radius:10px; font-weight:bold; color:${stockColor};">
                    Stock: ${p.stock}
                </small>
            </div>`;
        frag.appendChild(div);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
}

// --- CARRITO ---
function calcularVuelto() {
    const totalText = document.getElementById('pos-total').innerText.replace('S/ ', '');
    const total = parseFloat(totalText) || 0;
    const pago  = parseFloat(document.getElementById('pago-cliente').value) || 0;
    const vuelto = pago - total;
    document.getElementById('vuelto-cliente').innerText = `S/ ${Math.max(0, vuelto).toFixed(2)}`;
}

let productoSeleccionadoID = null;

// ── ESCÁNER SILENCIOSO (siempre activo en Ventas) ──
let streamSilencioso  = null;
let loopSilencioso    = null;
let scannerSilActivo  = false;

async function _arrancarEscanerSilencioso() {
    // Si ya está activo no arrancar de nuevo
    if (scannerSilActivo) return;
    scannerSilActivo = true;

    try {
        streamSilencioso = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        const videoSil = document.getElementById('scanner-video-sil');
        videoSil.srcObject = streamSilencioso;
        await videoSil.play();

        await new Promise(res => { videoSil.onloadedmetadata = res; setTimeout(res, 2000); });

        let ultimoCodigo = '';
        let ultimoTiempo = 0;

        if ('BarcodeDetector' in window) {
            const detector = new BarcodeDetector({
                formats: ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','qr_code','itf']
            });
            async function tickSil() {
                if (!scannerSilActivo) return;
                try {
                    const codes = await detector.detect(videoSil);
                    if (codes.length > 0) {
                        const codigo = codes[0].rawValue.trim();
                        const ahora  = Date.now();
                        // Evitar leer el mismo código 2 veces en menos de 2 segundos
                        if (codigo !== ultimoCodigo || (ahora - ultimoTiempo) > 2000) {
                            ultimoCodigo = codigo;
                            ultimoTiempo = ahora;
                            console.log('🔍 Escáner silencioso:', codigo);
                            if (navigator.vibrate) navigator.vibrate([80]);
                            const buscador = document.getElementById('pos-search');
                            buscador.value = codigo;
                            filtrarPOS(codigo);
                        }
                    }
                } catch(e) {}
                loopSilencioso = requestAnimationFrame(tickSil);
            }
            loopSilencioso = requestAnimationFrame(tickSil);
        } else {
            // Fallback ZXing
            const reader = new ZXing.BrowserMultiFormatReader();
            window._zxingSil = reader;
            reader.decodeFromConstraints(
                { video: { facingMode: 'environment' } },
                'scanner-video-sil',
                (result, err) => {
                    if (!scannerSilActivo) return;
                    if (result) {
                        const codigo  = result.getText().trim();
                        const ahora   = Date.now();
                        if (codigo !== ultimoCodigo || (ahora - ultimoTiempo) > 2000) {
                            ultimoCodigo = codigo;
                            ultimoTiempo = ahora;
                            if (navigator.vibrate) navigator.vibrate([80]);
                            const buscador = document.getElementById('pos-search');
                            buscador.value = codigo;
                            filtrarPOS(codigo);
                        }
                    }
                }
            );
        }
        console.log('✅ Escáner silencioso activo');
    } catch(err) {
        scannerSilActivo = false;
        console.warn('Escáner silencioso no disponible:', err.message);
    }
}

function _detenerEscanerSilencioso() {
    scannerSilActivo = false;
    if (loopSilencioso) { cancelAnimationFrame(loopSilencioso); loopSilencioso = null; }
    if (window._zxingSil) { try { window._zxingSil.reset(); } catch(e) {} window._zxingSil = null; }
    if (streamSilencioso) { streamSilencioso.getTracks().forEach(t => t.stop()); streamSilencioso = null; }
    const v = document.getElementById('scanner-video-sil');
    if (v) v.srcObject = null;
}

// ── ESCÁNER MANUAL (botón 📷, para registro o ventas) ──
// Agrega desde el GRID (click manual) → muestra modal de cantidad
function agregarCarrito(id) {
    const p = productos.find(x => x.id === id);
    if (p) {
        if (parseInt(p.stock) <= 0) return mostrarNotificacion('❌ Sin stock');
        productoSeleccionadoID = id;
        document.getElementById('cant-prod-nombre').innerText = p.nombre;
        document.getElementById('input-cantidad-manual').value = 1;
        document.getElementById('modal-cantidad').style.display = 'flex';
        setTimeout(() => {
            const input = document.getElementById('input-cantidad-manual');
            if (input) { input.focus(); input.select(); }
        }, 150);
    }
}

// Agrega desde el ESCÁNER → directo, sin modal, suma 1 cada vez
function agregarDirecto(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    if (parseInt(p.stock) <= 0) return mostrarNotificacion('❌ Sin stock: ' + p.nombre);

    const existente = carrito.find(x => x.id === id);
    const cantActual = existente ? existente.cant : 0;

    if (cantActual >= parseInt(p.stock)) {
        return mostrarNotificacion('⚠️ Stock máximo: ' + p.stock);
    }

    if (existente) {
        existente.cant += 1;
    } else {
        carrito.push({ ...p, cant: 1 });
    }

    renderBoleta();
    mostrarNotificacion('✅ ' + p.nombre + ' — x' + (cantActual + 1));
}

function setCantPreset(valor) {
    document.getElementById('input-cantidad-manual').value = valor;
}

function cerrarModalCantidad() {
    document.getElementById('modal-cantidad').style.display = 'none';
    productoSeleccionadoID = null;
    document.getElementById('pos-search').focus();
}

function confirmarAgregarCarrito() {
    const p = productos.find(x => x.id === productoSeleccionadoID);
    const cantPedida = parseInt(document.getElementById('input-cantidad-manual').value) || 0;

    if (cantPedida <= 0) return mostrarNotificacion('❌ Ingresa una cantidad válida');

    const itemExistente = carrito.find(x => x.id === productoSeleccionadoID);
    const cantEnCarrito  = itemExistente ? itemExistente.cant : 0;

    if ((cantEnCarrito + cantPedida) > parseInt(p.stock)) {
        return mostrarNotificacion(`⚠️ Solo quedan ${p.stock} en stock`);
    }

    if (itemExistente) {
        itemExistente.cant += cantPedida;
    } else {
        carrito.push({ ...p, cant: cantPedida });
    }

    renderBoleta();
    cerrarModalCantidad();
    mostrarNotificacion(`✅ ${cantPedida} x ${p.nombre} agregado`);
}

function quitarUno(id) {
    const idx = carrito.findIndex(x => x.id === id);
    if (idx !== -1) {
        carrito[idx].cant--;
        if (carrito[idx].cant <= 0) carrito.splice(idx, 1);
        renderBoleta();
    }
}

function renderBoleta() {
    const box = document.getElementById('carrito-items');
    let total = 0;
    box.innerHTML = '';
    carrito.forEach((i, index) => {
        const subtotal = i.precio * i.cant;
        total += subtotal;
        box.innerHTML += `
            <div class="item-boleta-linea" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:0.9rem; color:#000;">
                <div style="display:flex; gap:5px; flex:1;">
                    <span style="font-weight:800; min-width:25px;">${i.cant}x</span>
                    <span style="text-transform:uppercase;">${i.nombre}</span>
                </div>
                <div style="display:flex; align-items:center; gap:5px;">
                    <div style="font-weight:800; display:flex; align-items:center;">
                        <span>S/</span>
                        <input type="number" value="${i.precio.toFixed(2)}" step="0.10"
                               style="width:50px; border:none; background:transparent; font-weight:800; text-align:right; color:#000; outline:none; padding:0;"
                               onchange="modificarPrecioCarrito(${index}, this.value)">
                    </div>
                    <button class="no-print" onclick="quitarUno('${i.id}')" style="background:none; border:none; cursor:pointer; color:#ff4757; font-weight:bold;">➖</button>
                </div>
            </div>`;
    });
    document.getElementById('pos-total').innerText = 'S/ ' + total.toFixed(2);
    calcularVuelto();
}

function modificarPrecioCarrito(index, nuevoPrecio) {
    const precioNum = parseFloat(nuevoPrecio);
    if (isNaN(precioNum) || precioNum < 0) {
        mostrarNotificacion('❌ Precio no válido');
        renderBoleta();
        return;
    }
    carrito[index].precio = precioNum;
    renderBoleta();
}

function limpiarCarrito() {
    carrito = [];
    document.getElementById('pago-cliente').value = '';
    document.getElementById('vuelto-cliente').innerText = 'S/ 0.00';
    renderBoleta();
}

// --- FINALIZAR VENTA Y PDF ---
async function bajarPDFBoleta(nombreArchivo) {
    const element = document.querySelector('.boleta-card');
    const opt = {
        margin: 0,
        filename: nombreArchivo + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true },
        jsPDF: { unit: 'mm', format: [75, 200], orientation: 'portrait' }
    };
    return html2pdf().set(opt).from(element).outputPdf('blob');
}

async function finalizarVenta() {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío');

    const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cant), 0);
    const pagoCon    = parseFloat(document.getElementById('pago-cliente').value) || totalVenta;
    const vueltoVal  = pagoCon - totalVenta;
    const numTicket  = 'B001-' + Math.floor(Math.random() * 900000 + 100000);
    const ahora      = new Date();
    const fechaTexto = ahora.toLocaleDateString() + ' ' + ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const ventaData = {
        ticket: numTicket,
        fecha: fechaTexto,
        total: totalVenta,
        pagoCon: pagoCon,
        vuelto: Math.max(0, vueltoVal),
        cliente: document.getElementById('cliente-dni').value || 'General',
        productos: carrito.map(i => `${i.cant}x ${i.nombre}`),
        detalleCarrito: JSON.parse(JSON.stringify(carrito))
    };

    db.ref('ventas').push(ventaData);
    carrito.forEach(item => {
        db.ref('productos/' + item.id).update({ stock: item.stock - item.cant });
    });

    document.getElementById('num-ticket').innerText  = numTicket;
    document.getElementById('fecha-boleta').innerText = fechaTexto;

    const pdfBlob = await bajarPDFBoleta(numTicket);
    const url  = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${numTicket}.pdf`;
    link.click();

    window.print();
    limpiarCarrito();
    document.getElementById('cliente-dni').value = '';
    mostrarNotificacion('✅ Venta y PDF generados');
    document.getElementById('pos-search').focus();
}

// --- FILTRADO POS / BUSCADOR ---
function filtrarPOS(val) {
    const q       = val.trim().toLowerCase();
    const buscador = document.getElementById('pos-search');

    if (q === '') {
        document.querySelectorAll('.card-producto').forEach(c => c.style.display = 'block');
        return;
    }

    const exacto = productos.find(p => p.codigo === val.trim());

    if (exacto) {
        if (parseInt(exacto.stock) <= 0) {
            mostrarNotificacion('❌ AGOTADO: ' + exacto.nombre);
            buscador.value = '';
            return;
        }
        agregarDirecto(exacto.id);  // escáner → directo sin modal
        buscador.value = '';
        return;
    }

    renderTienda(q);
}

function resetearBuscador() {
    const buscador = document.getElementById('pos-search');
    buscador.value = '';
    buscador.focus();
    renderTienda();
    mostrarNotificacion('🧹 Búsqueda limpiada');
}

// --- HISTORIAL ---
db.ref('ventas').on('value', (snapshot) => {
    const ventas = snapshot.val();
    todasLasVentas = [];
    if (ventas) {
        Object.keys(ventas).forEach(key => {
            todasLasVentas.push({ id: key, ...ventas[key] });
        });
    }
    renderHistorialFiltrado();
});

function renderHistorialFiltrado() {
    const lista        = document.getElementById('lista-ventas');
    const displayTotal = document.getElementById('total-dia');
    const fDesde = document.getElementById('filtro-desde').value;
    const fHasta = document.getElementById('filtro-hasta').value;

    if (!lista) return;

    lista.innerHTML = '';
    let acumulado = 0;

    let ventasFiltradas = todasLasVentas.filter(v => {
        if (!fDesde && !fHasta) return true;
        const partes = v.fecha.split(' ')[0].split('/');
        const fechaVenta = new Date(partes[2], partes[1] - 1, partes[0]);
        const desde = fDesde ? new Date(fDesde + 'T00:00:00') : null;
        const hasta = fHasta ? new Date(fHasta + 'T23:59:59') : null;
        return (!desde || fechaVenta >= desde) && (!hasta || fechaVenta <= hasta);
    });

    ventasFiltradas.sort((a, b) => {
        const parsear = (texto) => {
            const [f, h] = texto.split(' ');
            const [d, m, y] = f.split('/');
            return new Date(y, m - 1, d, h.split(':')[0], h.split(':')[1]).getTime();
        };
        return parsear(b.fecha) - parsear(a.fecha);
    });

    let fechaActual = '';
    let htmlFinal   = '';

    ventasFiltradas.forEach(v => {
        const fechaDia = v.fecha.split(' ')[0];
        if (fechaDia !== fechaActual) {
            fechaActual = fechaDia;
            htmlFinal += `<div class="separador-fecha" style="background:#e2e2e2; padding:5px; margin:10px 0; font-weight:bold; border-radius:5px; text-align:center;">📅 VENTAS DEL ${fechaActual}</div>`;
        }
        acumulado += v.total;
        htmlFinal += `
            <div class="linea-historial" style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:10px 0; align-items:center;">
                <div style="flex:1;">
                    <strong style="color:#5352ed;">${v.ticket}</strong> <small>(${v.fecha.split(' ')[1]})</small><br>
                    <small>${v.productos.join(', ')}</small>
                </div>
                <div style="text-align:right;">
                    <span style="font-weight:bold; color:#2ed573;">S/ ${v.total.toFixed(2)}</span><br>
                    <button onclick="reimprimirTicket('${v.id}')" style="border:none; background:none; cursor:pointer; color:#5352ed;">📄 PDF</button>
                    <button onclick="prepararEliminarVenta('${v.id}', event)" style="border:none; background:none; cursor:pointer; color:#ff4757;">🗑️</button>
                </div>
            </div>`;
    });

    lista.innerHTML = htmlFinal;
    if (displayTotal) displayTotal.innerText = `Total Seleccionado: S/ ${acumulado.toFixed(2)}`;
}

async function descargarTodoPDF() {
    const fDesde = document.getElementById('filtro-desde').value;
    const fHasta = document.getElementById('filtro-hasta').value;

    let filtradas = todasLasVentas.filter(v => {
        if (!fDesde && !fHasta) return true;
        const partes = v.fecha.split(' ')[0].split('/');
        const fechaVenta = new Date(partes[2], partes[1] - 1, partes[0]);
        const desde = fDesde ? new Date(fDesde + 'T00:00:00') : null;
        const hasta = fHasta ? new Date(fHasta + 'T23:59:59') : null;
        return (!desde || fechaVenta >= desde) && (!hasta || fechaVenta <= hasta);
    });

    if (filtradas.length === 0) return mostrarNotificacion('No hay boletas');

    mostrarNotificacion('⚙️ Generando ZIP...');
    const zip = new JSZip();

    for (const v of filtradas) {
        document.getElementById('num-ticket').innerText   = v.ticket;
        document.getElementById('fecha-boleta').innerText = v.fecha;
        document.getElementById('pos-total').innerText    = 'S/ ' + v.total.toFixed(2);
        document.getElementById('vuelto-cliente').innerText = 'S/ ' + (v.vuelto ? v.vuelto.toFixed(2) : '0.00');
        document.getElementById('cliente-dni').value       = v.cliente;
        document.getElementById('pago-cliente').value      = v.pagoCon || v.total;

        const box = document.getElementById('carrito-items');
        box.innerHTML = '';

        if (v.detalleCarrito) {
            v.detalleCarrito.forEach(i => {
                box.innerHTML += `
                    <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px; color:#000; font-family:monospace;">
                        <div style="display:flex; gap:4px;">
                            <b style="font-weight:800;">${i.cant}x</b>
                            <span style="text-transform:uppercase;">${i.nombre}</span>
                        </div>
                        <b style="font-weight:800;">S/ ${i.precio.toFixed(2)}</b>
                    </div>`;
            });
        } else {
            v.productos.forEach(p => {
                box.innerHTML += `<div style="font-size:0.85rem; font-weight:800; color:#000; margin-bottom:4px;">${p}</div>`;
            });
        }

        const pdfBlob = await bajarPDFBoleta(v.ticket);
        zip.file(`${v.ticket}.pdf`, pdfBlob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(content);
    link.download = `Boletas_VaneStore_${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();
    mostrarNotificacion('✅ ZIP Descargado');
    limpiarCarrito();
}

function reimprimirTicket(id) {
    const v = todasLasVentas.find(x => x.id === id);
    if (v) {
        document.getElementById('num-ticket').innerText    = v.ticket;
        document.getElementById('fecha-boleta').innerText  = v.fecha;
        document.getElementById('pos-total').innerText     = 'S/ ' + v.total.toFixed(2);
        document.getElementById('vuelto-cliente').innerText = 'S/ ' + (v.vuelto ? v.vuelto.toFixed(2) : '0.00');
        document.getElementById('cliente-dni').value        = v.cliente;
        document.getElementById('pago-cliente').value       = v.pagoCon || v.total;

        const box = document.getElementById('carrito-items');
        box.innerHTML = '';

        if (v.detalleCarrito) {
            v.detalleCarrito.forEach(i => {
                box.innerHTML += `
                    <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px; color:#000; font-family:monospace;">
                        <div style="display:flex; gap:4px;">
                            <b style="font-weight:800;">${i.cant}x</b>
                            <span style="text-transform:uppercase;">${i.nombre}</span>
                        </div>
                        <b style="font-weight:800;">S/ ${i.precio.toFixed(2)}</b>
                    </div>`;
            });
        } else {
            v.productos.forEach(prodStr => {
                box.innerHTML += `<div style="font-size:0.85rem; color:#000; font-weight:800;">${prodStr}</div>`;
            });
        }
        setTimeout(() => { window.print(); }, 300);
    }
}

function exportarExcel() {
    if (todasLasVentas.length === 0) return mostrarNotificacion('No hay datos');
    const fDesde = document.getElementById('filtro-desde').value;
    const fHasta = document.getElementById('filtro-hasta').value;

    let filtradas = todasLasVentas.filter(v => {
        if (!fDesde && !fHasta) return true;
        const partes = v.fecha.split(' ')[0].split('/');
        const fechaVenta = new Date(partes[2], partes[1] - 1, partes[0]);
        const desde = fDesde ? new Date(fDesde + 'T00:00:00') : null;
        const hasta = fHasta ? new Date(fHasta + 'T23:59:59') : null;
        return (!desde || fechaVenta >= desde) && (!hasta || fechaVenta <= hasta);
    });

    const datosExcel = filtradas.map(v => ({
        'Ticket': v.ticket,
        'Fecha':  v.fecha,
        'Cliente': v.cliente || 'General',
        'Total':   v.total,
        'Pago':    v.pagoCon,
        'Vuelto':  v.vuelto
    }));

    const hoja  = XLSX.utils.json_to_sheet(datosExcel);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Ventas');
    XLSX.writeFile(libro, 'Reporte_VaneStore.xlsx');
}

// --- DARK MODE ---
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('dark-mode', document.body.classList.contains('dark-mode'));
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {

    // Input cantidad — Enter confirma
    const inputCant = document.getElementById('input-cantidad-manual');
    if (inputCant) {
        inputCant.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') confirmarAgregarCarrito();
        });
    }

    // Input código en registro — Enter salta al nombre
    const inputCodigoReg = document.getElementById('prod-codigo');
    if (inputCodigoReg) {
        inputCodigoReg.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('prod-nombre').focus();
            }
        });
    }

    // Foco automático en buscador al hacer click fuera de inputs/modales
    document.addEventListener('click', (e) => {
        const secPos = document.getElementById('sec-pos');
        if (secPos && secPos.style.display !== 'none') {
            const esInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
            const esModal = e.target.closest('.modal-vane') || e.target.closest('#modal-cantidad') || e.target.closest('#scanner-overlay');
            if (!esInput && !esModal) {
                document.getElementById('pos-search').focus();
            }
        }
    });

    // Buscador — escáner físico / teclado
    const posSearch = document.getElementById('pos-search');
    if (posSearch) {
        posSearch.addEventListener('input',   (e) => filtrarPOS(e.target.value));
        posSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                filtrarPOS(posSearch.value);
            }
        });
    }

    // Cerrar scanner-overlay con tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scannerActivo) cerrarEscaner();
    });
});

window.onload = () => {
    if (localStorage.getItem('dark-mode') === 'true') {
        document.body.classList.add('dark-mode');
    }
    const search = document.getElementById('pos-search');
    if (search) search.focus();
};