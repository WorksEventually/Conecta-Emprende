import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuthStore } from "../stores/auth-store";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { BrandMark } from "../components/ui/BrandMark";
import { PasswordStrength } from "../components/ui/PasswordStrength";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [passwordRules, setPasswordRules] = useState({
    minLen: false, hasUpper: false, hasNumber: false, hasSpecial: false,
  });

  useEffect(() => {
    setPasswordRules({
      minLen:   password.length >= 8,
      hasUpper: /[A-ZÁÉÍÓÚÑ]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    });
  }, [password]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    const success = await register(name, email, password);
    if (success) {
      navigate("/");
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const rulesMet = Object.values(passwordRules).filter(Boolean).length;
  const hintText =
    !password ? "" :
    rulesMet <= 2 ? "Contraseña débil" :
    rulesMet === 3 ? "Casi ahí..." :
    "¡Contraseña segura!";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <h1>TradeArc</h1>
        </div>

        <h2>Crear cuenta</h2>
        <p className="auth-subtitle">Unite a la red de emprendedores</p>

        {error && (
          <div className="auth-error-banner">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <button className="auth-social-btn" onClick={handleGoogleLogin} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#1A3C6E"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#1A3C6E"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#1A3C6E"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#1A3C6E"/>
          </svg>
          Continuar con Google
        </button>

        <div className="auth-divider">
          <span>o</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="Nombre completo"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            icon={<User size={16} />}
            autoComplete="name"
            maxLength={100}
            required
          />

          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            icon={<Mail size={16} />}
            autoComplete="email"
            required
          />

          <div className="field-group">
            <label className="field-label">
              <Lock size={16} />
              Contraseña
            </label>
            <div className="input-with-icon">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                autoComplete="new-password"
                className="field-input field-input-with-icon"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="form-hint">
              {hintText ? <strong>{hintText}</strong> : "Mínimo 8 caracteres"}
            </span>
            <PasswordStrength password={password} />
          </div>

          <Button
            type="submit"
            loading={isLoading}
            fullWidth
            icon={!isLoading ? <ArrowRight size={18} /> : undefined}
          >
            {isLoading ? "Creando cuenta..." : "Crear cuenta"}
          </Button>
        </form>

        <p className="auth-terms">
          Al crear una cuenta aceptás nuestros{" "}
          <a href="#">Términos de servicio</a> y{" "}
          <a href="#">Política de privacidad</a>.
        </p>

        <p className="auth-switch">
          ¿Ya tenés cuenta? <Link to="/auth/login">Iniciar sesión</Link>
        </p>
      </div>
    </div>
  );
}
