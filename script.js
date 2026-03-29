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
        // Usar debounce global para evitar doble disparo con escáner silencioso
        _procesarCodigoEscaneado(codigo);
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
        if (el) el.focus({ preventScroll: true });
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
        // Sin focus automático — evita scroll no deseado
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
            (p.codigo && p.codigo.toLowerCase().includes(filtro.toLowerCase())))
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

// ============================================================
//  ESCÁNER SILENCIOSO — TOGGLE (botón enciende/apaga)
// ============================================================
let streamSilencioso  = null;
let loopSilencioso    = null;
let scannerSilActivo  = false;
let _ultimoCodigoGlobal = '';
let _ultimoTiempoGlobal = 0;

function toggleEscanerSilencioso() {
    if (scannerSilActivo) {
        _detenerEscanerSilencioso();
    } else {
        _arrancarEscanerSilencioso();
    }
}

// Función para escáner SILENCIOSO — procesa directo sin tocar el buscador
function _procesarCodigoEscaneadoSilencioso(codigo) {
    const ahora = Date.now();
    if (codigo === _ultimoCodigoGlobal && (ahora - _ultimoTiempoGlobal) < 2500) return;
    _ultimoCodigoGlobal = codigo;
    _ultimoTiempoGlobal = ahora;

    if (navigator.vibrate) navigator.vibrate([80]);

    // Buscar producto por código exacto
    const producto = productos.find(p => p.codigo === codigo);
    if (producto) {
        if (parseInt(producto.stock) <= 0) {
            mostrarNotificacion('❌ AGOTADO: ' + producto.nombre);
        } else {
            agregarDirecto(producto.id);
        }
    } else {
        // No encontrado — NO escribir en el buscador, solo notificar brevemente
        mostrarNotificacion('🔍 Código no registrado: ' + codigo);
    }
}

// Función para escáner MANUAL (modal 📷) — usa el buscador
function _procesarCodigoEscaneado(codigo) {
    const ahora = Date.now();
    // Ignorar si es el mismo código en menos de 2.5 segundos
    if (codigo === _ultimoCodigoGlobal && (ahora - _ultimoTiempoGlobal) < 2500) {
        console.log('🚫 Código ignorado (doble disparo):', codigo);
        return;
    }
    _ultimoCodigoGlobal = codigo;
    _ultimoTiempoGlobal = ahora;

    if (navigator.vibrate) navigator.vibrate([80]);
    const buscador = document.getElementById('pos-search');
    buscador.value = codigo;
    filtrarPOS(codigo);
    setTimeout(() => {
        if (buscador.value === codigo) {
            buscador.value = '';
            renderTienda();
        }
    }, 1500);
}

function _actualizarBotonEscaner(activo) {
    const btn    = document.getElementById('btn-abrir-scanner');
    const status = document.getElementById('scanner-status');
    if (!btn) return;
    if (activo) {
        btn.innerHTML     = '🟢 Escáner Activo';
        btn.title         = 'Clic para apagar el escáner';
        btn.style.background  = '#00c853';
        btn.style.boxShadow   = '0 0 0 4px rgba(46,213,115,0.4), 0 4px 12px rgba(46,213,115,0.4)';
        btn.style.animation   = 'pulse-scanner 1.5s ease-in-out infinite';
        if (status) { status.textContent = 'Apunta la cámara al código de barras 📦'; status.style.color = '#2ed573'; }
    } else {
        btn.innerHTML     = '📷 Activar Escáner';
        btn.title         = 'Activar escáner';
        btn.style.background  = '#2ed573';
        btn.style.boxShadow   = '0 4px 12px rgba(46,213,115,0.35)';
        btn.style.animation   = 'none';
        if (status) { status.textContent = 'Escáner apagado'; status.style.color = '#999'; }
    }
}

async function _arrancarEscanerSilencioso() {
    if (scannerSilActivo) return;
    scannerSilActivo = true;
    _actualizarBotonEscaner(true);
    mostrarNotificacion('📷 Escáner activado');

    try {
        streamSilencioso = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        const videoSil = document.getElementById('scanner-video-sil');
        videoSil.srcObject = streamSilencioso;
        await videoSil.play();
        await new Promise(res => { videoSil.onloadedmetadata = res; setTimeout(res, 2000); });

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
                        _procesarCodigoEscaneadoSilencioso(codigo);
                    }
                } catch(e) {}
                loopSilencioso = requestAnimationFrame(tickSil);
            }
            loopSilencioso = requestAnimationFrame(tickSil);
        } else {
            const reader = new ZXing.BrowserMultiFormatReader();
            window._zxingSil = reader;
            reader.decodeFromConstraints(
                { video: { facingMode: 'environment' } },
                'scanner-video-sil',
                (result) => {
                    if (!scannerSilActivo || !result) return;
                    const codigo = result.getText().trim();
                    _procesarCodigoEscaneadoSilencioso(codigo);
                }
            );
        }
    } catch(err) {
        scannerSilActivo = false;
        _actualizarBotonEscaner(false);
        mostrarNotificacion('⚠️ No se pudo activar: ' + err.message);
    }
}

function _detenerEscanerSilencioso() {
    scannerSilActivo = false;
    _actualizarBotonEscaner(false);
    if (loopSilencioso) { cancelAnimationFrame(loopSilencioso); loopSilencioso = null; }
    if (window._zxingSil) { try { window._zxingSil.reset(); } catch(e) {} window._zxingSil = null; }
    if (streamSilencioso) { streamSilencioso.getTracks().forEach(t => t.stop()); streamSilencioso = null; }
    const v = document.getElementById('scanner-video-sil');
    if (v) v.srcObject = null;
    mostrarNotificacion('📷 Escáner apagado');
}


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

    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cant;
        total += subtotal;

        // Contenedor principal
        const linea = document.createElement('div');
        linea.style.cssText = 'margin-bottom:6px; font-size:11px; color:#000; font-family:Courier New,monospace;';

        // Fila superior
        const fila = document.createElement('div');
        fila.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

        // Nombre + cantidad
        const izq = document.createElement('div');
        izq.style.cssText = 'display:flex; gap:4px; flex:1; overflow:hidden;';
        izq.innerHTML = `<span style="font-weight:800; white-space:nowrap;">${item.cant}x</span>
                         <span style="text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.nombre}</span>`;

        // Precio + botón
        const der = document.createElement('div');
        der.style.cssText = 'display:flex; align-items:center; gap:4px; flex-shrink:0;';

        const labelS = document.createElement('span');
        labelS.style.fontWeight = '800';
        labelS.textContent = 'S/';

        // Input precio (pantalla)
        const inputPrecio = document.createElement('input');
        inputPrecio.type = 'number';
        inputPrecio.value = item.precio.toFixed(2);
        inputPrecio.step = '0.10';
        inputPrecio.style.cssText = 'width:45px; border:none; background:transparent; font-weight:800; text-align:right; color:#000; outline:none; padding:0; font-family:Courier New,monospace; font-size:11px;';
        inputPrecio.addEventListener('change', function() {
            modificarPrecioCarrito(index, this.value);
        });

        // Span precio (impresión) — oculto en pantalla, visible al imprimir via CSS
        const spanPrecio = document.createElement('span');
        spanPrecio.className = 'precio-print';
        // NO usar display:none inline — el @media print no puede overridarlo con !important en algunos browsers
        // En cambio usamos visibility y posición absoluta para ocultarlo en pantalla
        spanPrecio.style.cssText = 'position:absolute; left:-9999px; font-weight:800;';
        spanPrecio.textContent = 'S/ ' + subtotal.toFixed(2);

        // Botón quitar — usa closure para capturar el id correcto
        const btnQuitar = document.createElement('button');
        btnQuitar.className = 'no-print';
        btnQuitar.textContent = '➖';
        btnQuitar.style.cssText = 'background:none; border:none; cursor:pointer; color:#ff4757; font-weight:bold; font-size:12px; padding:0 2px;';
        btnQuitar.addEventListener('click', (function(id) {
            return function() { quitarUno(id); };
        })(item.id));

        der.appendChild(labelS);
        der.appendChild(inputPrecio);
        der.appendChild(spanPrecio);
        der.appendChild(btnQuitar);

        fila.appendChild(izq);
        fila.appendChild(der);
        linea.appendChild(fila);

        // Línea 2: desglose si cant > 1
        if (item.cant > 1) {
            const desglose = document.createElement('div');
            desglose.style.cssText = 'color:#666; font-size:10px; padding-left:18px;';
            desglose.textContent = `S/ ${item.precio.toFixed(2)} x ${item.cant} = S/ ${subtotal.toFixed(2)}`;
            linea.appendChild(desglose);
        }

        box.appendChild(linea);
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
// ── Imprimir boleta usando iframe oculto (sin ventana nueva) ──
function imprimirBoleta(callback) {
    // Construir HTML de items desde el carrito directamente
    let itemsHTML = '';
    carrito.forEach(item => {
        const subtotal = item.precio * item.cant;
        itemsHTML += `<div class="item-linea">
            <span class="item-cant-nom">${item.cant}x ${item.nombre.toUpperCase()}</span>
            <span class="item-precio">S/ ${subtotal.toFixed(2)}</span>
        </div>`;
        if (item.cant > 1) {
            itemsHTML += `<div class="item-desglose">S/ ${item.precio.toFixed(2)} x ${item.cant} = S/ ${subtotal.toFixed(2)}</div>`;
        }
    });

    const total    = document.getElementById('pos-total').innerText;
    const pagoCon  = document.getElementById('pago-cliente').value || '0.00';
    const vuelto   = document.getElementById('vuelto-cliente').innerText;
    const fecha    = document.getElementById('fecha-boleta').innerText;
    const ticket   = document.getElementById('num-ticket').innerText;
    const vendedor = document.getElementById('vendedor-nombre').value;
    const cliente  = document.getElementById('cliente-dni').value || '—';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size: 80mm auto; margin: 2mm; }
  body { font-family:'Courier New',monospace; font-size:11px; color:#000; width:76mm; }
  .center { text-align:center; }
  .bold   { font-weight:bold; }
  .titulo { font-size:14px; font-weight:bold; letter-spacing:2px; }
  .dash   { border-top:1px dashed #000; margin:4px 0; }
  .row    { display:flex; justify-content:space-between; font-size:10px; margin:2px 0; }
  .label  { font-size:10px; margin:1px 0; }
  .item-linea { display:flex; justify-content:space-between; font-size:10px; margin:3px 0; }
  .item-cant-nom { flex:1; }
  .item-precio   { font-weight:bold; flex-shrink:0; margin-left:4px; }
  .item-desglose { font-size:9px; color:#444; padding-left:14px; margin-bottom:2px; }
  .total-row { display:flex; justify-content:space-between; font-size:12px; font-weight:bold; margin:4px 0; }
  .footer { text-align:center; font-size:9px; margin-top:6px; border-top:1px dashed #000; padding-top:5px; }
</style>
</head>
<body>
  <div class="center titulo">VANE STORE</div>
  <div class="center label">RUC: 10612629230</div>
  <div class="center label">Calle 7 #170 Av. Buenos Aires</div>
  <div class="center label">${fecha}</div>
  <div class="dash"></div>
  <div class="center bold">${ticket}</div>
  <div class="dash"></div>
  <div class="label">Vendedor: ${vendedor}</div>
  <div class="label">Cliente (DNI/RUC): ${cliente}</div>
  <div class="dash"></div>
  ${itemsHTML}
  <div class="dash"></div>
  <div class="total-row"><span>TOTAL A PAGAR:</span><span>${total}</span></div>
  <div class="row"><span>Paga con: S/</span><span>${pagoCon}</span></div>
  <div class="row bold"><span>Vuelto:</span><span>${vuelto}</span></div>
  <div class="footer">
    ********************************<br>
    ¡GRACIAS POR TU COMPRA EN VANE STORE!<br>
    ********************************
  </div>

</body>
</html>`;

    // Crear iframe oculto
    let iframe = document.getElementById('print-iframe');
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:80mm; height:0; border:none; opacity:0;';
    document.body.appendChild(iframe);

    iframe.onload = () => {
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                iframe.remove();
                if (callback) callback();
            }, 1000);
        }, 300);
    };

    iframe.srcdoc = html;
}


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
    // Descontar stock leyendo valor actual de Firebase para evitar inconsistencias
    carrito.forEach(item => {
        db.ref('productos/' + item.id + '/stock').transaction(stockActual => {
            return (stockActual || 0) - item.cant;
        });
    });

    document.getElementById('num-ticket').innerText  = numTicket;
    document.getElementById('fecha-boleta').innerText = fechaTexto;

    const pdfBlob = await bajarPDFBoleta(numTicket);
    const url  = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${numTicket}.pdf`;
    link.click();

    // Imprimir y limpiar SOLO después de que se cierre el diálogo de impresión
    // Imprimir — limpiar carrito después via callback
    imprimirBoleta(() => {
        limpiarCarrito();
        document.getElementById('cliente-dni').value = '';
        mostrarNotificacion('✅ Venta registrada e impresa');
        document.getElementById('pos-search').focus({ preventScroll: true });
    });
}

// --- FILTRADO POS / BUSCADOR ---
function filtrarPOS(val) {
    const q        = val.trim();
    const qLower   = q.toLowerCase();
    const buscador = document.getElementById('pos-search');

    // Campo vacío → mostrar todo
    if (q === '') {
        renderTienda();
        return;
    }

    // Coincidencia EXACTA de código → agregar directo (escáner físico o USB)
    const exacto = productos.find(p => p.codigo === q);
    if (exacto) {
        if (parseInt(exacto.stock) <= 0) {
            mostrarNotificacion('❌ AGOTADO: ' + exacto.nombre);
            buscador.value = '';
            return;
        }
        agregarDirecto(exacto.id);
        buscador.value = '';
        return;
    }

    // Búsqueda parcial por nombre O código → mostrar tarjetas filtradas
    const resultados = productos.filter(p =>
        p.nombre.toLowerCase().includes(qLower) ||
        (p.codigo && p.codigo.toLowerCase().includes(qLower))
    );

    // Si hay un solo resultado y es búsqueda por Enter, agregarlo directo
    if (resultados.length === 1 && buscador._enterPressed) {
        buscador._enterPressed = false;
        if (parseInt(resultados[0].stock) <= 0) {
            mostrarNotificacion('❌ AGOTADO: ' + resultados[0].nombre);
            buscador.value = '';
            renderTienda();
            return;
        }
        agregarDirecto(resultados[0].id);
        buscador.value = '';
        renderTienda();
        return;
    }

    renderTienda(qLower);
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

async function reimprimirTicket(id) {
    const v = todasLasVentas.find(x => x.id === id);
    if (!v) return;

    // Guardamos el estado actual del carrito para restaurarlo después
    const carritoBackup      = JSON.parse(JSON.stringify(carrito));
    const ticketBackup       = document.getElementById('num-ticket').innerText;
    const fechaBackup        = document.getElementById('fecha-boleta').innerText;
    const totalBackup        = document.getElementById('pos-total').innerText;
    const vueltoBackup       = document.getElementById('vuelto-cliente').innerText;
    const clienteBackup      = document.getElementById('cliente-dni').value;
    const pagoBackup         = document.getElementById('pago-cliente').value;
    const carritoItemsBackup = document.getElementById('carrito-items').innerHTML;

    // Rellenamos la boleta con los datos de la venta a reimprimir
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
        v.productos.forEach(p => {
            box.innerHTML += `<div style="font-size:0.85rem; color:#000; font-weight:800;">${p}</div>`;
        });
    }

    // Descargar PDF
    const pdfBlob = await bajarPDFBoleta(v.ticket);
    const url  = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${v.ticket}.pdf`;
    link.click();

    // Restaurar estado original después de imprimir
    const restaurar = () => {
        carrito = carritoBackup;
        document.getElementById('num-ticket').innerText     = ticketBackup;
        document.getElementById('fecha-boleta').innerText   = fechaBackup;
        document.getElementById('pos-total').innerText      = totalBackup;
        document.getElementById('vuelto-cliente').innerText = vueltoBackup;
        document.getElementById('cliente-dni').value        = clienteBackup;
        document.getElementById('pago-cliente').value       = pagoBackup;
        document.getElementById('carrito-items').innerHTML  = carritoItemsBackup;
    };

    setTimeout(() => { imprimirBoleta(restaurar); }, 500);
}

async function exportarExcel() {
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

    if (filtradas.length === 0) return mostrarNotificacion('No hay ventas en ese rango');

    // ── Consolidar productos ──
    const consolidado = {};
    filtradas.forEach(v => {
        if (v.detalleCarrito) {
            v.detalleCarrito.forEach(item => {
                if (!consolidado[item.nombre]) consolidado[item.nombre] = { nombre: item.nombre, cantidad: 0, total: 0 };
                consolidado[item.nombre].cantidad += item.cant;
                consolidado[item.nombre].total    += item.precio * item.cant;
            });
        }
    });

    const lista        = Object.values(consolidado).sort((a, b) => b.total - a.total);
    const totalGeneral = lista.reduce((s, p) => s + p.total, 0);
    const totalCant    = lista.reduce((s, p) => s + p.cantidad, 0);
    const periodoTexto = fDesde && fHasta ? `${fDesde} al ${fHasta}` : new Date().toLocaleDateString('es-PE');
    const fechaArchivo = new Date().toISOString().slice(0, 10);

    // ── Construir HTML del reporte (igual al PDF de referencia) ──
    const filas = lista.map((p, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
            <td style="padding:7px 10px; border:1px solid #dee2e6; text-align:center;">${i + 1}</td>
            <td style="padding:7px 10px; border:1px solid #dee2e6;">${p.nombre}</td>
            <td style="padding:7px 10px; border:1px solid #dee2e6; text-align:center;">${p.cantidad}</td>
            <td style="padding:7px 10px; border:1px solid #dee2e6; text-align:right;">S/ ${p.total.toFixed(2)}</td>
        </tr>`).join('');

    const htmlReporte = `
        <div style="font-family: Arial, sans-serif; padding: 30px; color: #000; max-width: 750px; margin: 0 auto;">

            <!-- ENCABEZADO -->
            <div style="border-bottom: 3px solid #2f3542; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="margin:0; font-size:1.6rem; color:#2f3542; letter-spacing:2px;">VANE STORE</h1>
                <p style="margin:4px 0; font-size:0.85rem; color:#555;">RUC: 10612629230</p>
                <p style="margin:4px 0; font-size:0.85rem; color:#555;">Calle 7 #170 Av. Buenos Aires</p>
            </div>

            <!-- TÍTULO REPORTE -->
            <div style="background:#2f3542; color:white; padding:10px 15px; border-radius:6px; margin-bottom:20px;">
                <h2 style="margin:0; font-size:1rem; letter-spacing:1px;">CONSOLIDADO DE ITEMS — TOTALES</h2>
                <p style="margin:4px 0 0; font-size:0.8rem; opacity:0.8;">Período: ${periodoTexto} &nbsp;|&nbsp; Ventas: ${filtradas.length} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-PE')}</p>
            </div>

            <!-- TABLA -->
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                    <tr style="background:#2f3542; color:white;">
                        <th style="padding:9px 10px; border:1px solid #2f3542; text-align:center; width:40px;">#</th>
                        <th style="padding:9px 10px; border:1px solid #2f3542; text-align:left;">Producto</th>
                        <th style="padding:9px 10px; border:1px solid #2f3542; text-align:center; width:110px;">Cantidad Total</th>
                        <th style="padding:9px 10px; border:1px solid #2f3542; text-align:right; width:130px;">Total de Venta</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas}
                </tbody>
                <tfoot>
                    <tr style="background:#2ed573; font-weight:bold;">
                        <td colspan="2" style="padding:9px 10px; border:1px solid #28c26a; text-align:right;">TOTAL GENERAL</td>
                        <td style="padding:9px 10px; border:1px solid #28c26a; text-align:center;">${totalCant}</td>
                        <td style="padding:9px 10px; border:1px solid #28c26a; text-align:right;">S/ ${totalGeneral.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <!-- RESUMEN -->
            <div style="margin-top:20px; display:flex; gap:20px; flex-wrap:wrap;">
                <div style="background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; padding:12px 20px; min-width:150px;">
                    <div style="font-size:0.72rem; color:#666; text-transform:uppercase; letter-spacing:1px;">N° de Ventas</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:#2f3542;">${filtradas.length}</div>
                </div>
                <div style="background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; padding:12px 20px; min-width:150px;">
                    <div style="font-size:0.72rem; color:#666; text-transform:uppercase; letter-spacing:1px;">Total Recaudado</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:#2ed573;">S/ ${totalGeneral.toFixed(2)}</div>
                </div>
                <div style="background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; padding:12px 20px; min-width:150px;">
                    <div style="font-size:0.72rem; color:#666; text-transform:uppercase; letter-spacing:1px;">Ticket Promedio</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:#2f3542;">S/ ${(totalGeneral / filtradas.length).toFixed(2)}</div>
                </div>
                <div style="background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; padding:12px 20px; min-width:150px;">
                    <div style="font-size:0.72rem; color:#666; text-transform:uppercase; letter-spacing:1px;">Productos Vendidos</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:#2f3542;">${lista.length}</div>
                </div>
            </div>

            <!-- PIE -->
            <div style="margin-top:25px; border-top:1px solid #dee2e6; padding-top:10px; font-size:0.75rem; color:#999; text-align:center;">
                Reporte generado por VANE STORE POS · ${new Date().toLocaleString('es-PE')}
            </div>
        </div>`;

    // ── Crear div temporal, convertir a PDF con html2pdf ──
    mostrarNotificacion('⚙️ Generando reporte PDF...');
    const contenedor = document.createElement('div');
    contenedor.innerHTML = htmlReporte;
    document.body.appendChild(contenedor);

    const opt = {
        margin:     [10, 10, 10, 10],
        filename:   `Reporte_VaneStore_${fechaArchivo}.pdf`,
        image:      { type: 'jpeg', quality: 0.98 },
        html2canvas:{ scale: 2, useCORS: true },
        jsPDF:      { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(contenedor).save();
    document.body.removeChild(contenedor);
    mostrarNotificacion('✅ Reporte PDF descargado — ' + lista.length + ' productos');
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
    // Click listener de foco removido — causaba scroll y códigos no deseados en buscador


    // Buscador eliminado — escáner procesa directamente
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scannerActivo) cerrarEscaner();
    });
});

window.onload = () => {
    if (localStorage.getItem('dark-mode') === 'true') {
        document.body.classList.add('dark-mode');
    }
    // No hacer focus automático al cargar — evita scroll no deseado
};