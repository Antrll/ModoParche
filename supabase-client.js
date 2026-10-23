// ModoParche - Supabase Client & Database Services
// Conexión directa a la base de datos en Supabase para Frontend y Vercel

const SUPABASE_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eHFxeG5vd2x3aWFob3JpZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MzMzMTIsImV4cCI6MjEwODIwOTMxMn0.rO4W027LLI5CR-wz753KFzyYiLAn-I-avLre7nbVoII';

class SupabaseService {
  constructor() {
    this.url = SUPABASE_URL;
    this.key = SUPABASE_ANON_KEY;
  }

  get headers() {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async _fetch(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.url}/rest/v1/${endpoint}`, {
        ...options,
        headers: {
          ...this.headers,
          ...(options.headers || {})
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error en la petición (${response.status})`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[Supabase Error - ${endpoint}]:`, err);
      throw err;
    }
  }

  // --- CIUDADES Y CATEGORÍAS ---
  async getCiudades() {
    return this._fetch('ciudades?select=*&order=id.asc');
  }

  async getCategorias() {
    return this._fetch('categorias?select=*&order=id.asc');
  }

  // --- PARCHES (PLANES) ---
  async getParches(filtros = {}) {
    let query = 'parches?select=*,categorias(nombre,slug,icono),ciudades(nombre)&order=fecha.asc';
    if (filtros.ciudadId) {
      query += `&ciudad_id=eq.${filtros.ciudadId}`;
    }
    if (filtros.categoriaId) {
      query += `&categoria_id=eq.${filtros.categoriaId}`;
    }
    return this._fetch(query);
  }

  async crearParche(parcheData) {
    return this._fetch('parches', {
      method: 'POST',
      body: JSON.stringify(parcheData)
    });
  }

  async unirseAParche(parcheId, usuarioId) {
    return this._fetch('parche_miembros', {
      method: 'POST',
      body: JSON.stringify({
        parche_id: parcheId,
        usuario_id: usuarioId,
        rol: 'miembro'
      })
    });
  }

  // --- COMERCIOS ---
  async getComercios() {
    return this._fetch('comercios?select=*,ciudades(nombre),categorias(nombre)&order=nombre.asc');
  }

  // --- AUTENTICACIÓN / USUARIOS ---
  async registrarUsuario(datos) {
    const res = await this._fetch('usuarios', {
      method: 'POST',
      body: JSON.stringify({
        nombre: datos.nombre,
        cedula: datos.cedula,
        telefono: datos.telefono,
        email: datos.email,
        password_hash: datos.password, // En producción real se recomienda Supabase Auth
        ciudad_id: datos.ciudad_id || 1,
        fecha_nacimiento: datos.fecha_nacimiento || null,
        instagram_usuario: datos.instagram || null,
        estado_id: 1
      })
    });

    const nuevoUsuario = res[0] || res;

    // Guardar intereses si existen
    if (datos.categorias && datos.categorias.length && nuevoUsuario?.id) {
      const intereses = datos.categorias.map(catId => ({
        usuario_id: nuevoUsuario.id,
        categoria_id: parseInt(catId, 10)
      }));
      await this._fetch('intereses_usuario', {
        method: 'POST',
        body: JSON.stringify(intereses)
      }).catch(err => console.warn('Error guardando intereses:', err));
    }

    return nuevoUsuario;
  }

  async login(credencial, password) {
    // Buscar por email o teléfono
    const query = `usuarios?select=*&or=(email.eq.${encodeURIComponent(credencial)},telefono.eq.${encodeURIComponent(credencial)})&limit=1`;
    const usuarios = await this._fetch(query);
    if (!usuarios || usuarios.length === 0) {
      throw new Error('Credenciales incorrectas o usuario no encontrado.');
    }
    const usuario = usuarios[0];
    if (usuario.password_hash !== password) {
      throw new Error('Contraseña incorrecta.');
    }
    if (usuario.estado_id !== 1) {
      throw new Error('Tu cuenta no está activa o se encuentra suspendida.');
    }
    return usuario;
  }
}

// Instancia global
window.ModoParcheDB = new SupabaseService();
