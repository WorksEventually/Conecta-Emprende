import { User, Store, MapPin, Building, Activity, Save, Sparkles, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function ProfilePage() {
  const providerId = "1";
  const queryClient = useQueryClient();
  
  const { data: provider, isLoading: isProviderLoading } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: async () => {
      const res = await fetch(`/api/providers/${providerId}`);
      const json = await res.json();
      return json.data;
    }
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const res = await fetch(`/api/quotes`);
      const json = await res.json();
      return json.data;
    }
  });

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showEnhanceSuccess, setShowEnhanceSuccess] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    category: "",
    city: "",
    bio: "",
    phone: "+505 8000 0000"
  });

  // Sync when data loads
  useEffect(() => {
    if (provider) {
       setFormData({
         displayName: provider.displayName || "",
         category: provider.category || "",
         city: provider.city || "",
         bio: provider.bio || "",
         phone: provider.phone || "+505 8000 0000"
       });
    }
  }, [provider]);

  const saveMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      const res = await fetch(`/api/providers/${providerId}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(updatedData)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider', providerId] });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    }
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleEnhanceBio = async () => {
    if (!formData.bio.trim() || formData.bio.length < 10) return;
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/providers/enhance-bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: formData.bio, category: formData.category })
      });
      const data = await res.json();
      if (data.success && data.bio) {
        setFormData({ ...formData, bio: data.bio });
        setShowEnhanceSuccess(true);
        setTimeout(() => setShowEnhanceSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12 h-full overflow-y-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#333333] tracking-tight">Mi Perfil</h1>
        <p className="text-[rgba(51,51,51,0.72)] font-medium mt-2">Gestiona tu información pública, servicios y ubicación de tu negocio.</p>
      </div>

      <div className="space-y-8">
        {/* Profile Card */}
        <div className="bg-white rounded-3xl border border-[rgba(26,60,110,0.18)] shadow-sm overflow-hidden">
          <div className="h-28 bg-gradient-to-r from-[#1A3C6E] to-[#00D4FF]"></div>
          <div className="px-8 pb-8 relative">
            <div className="absolute -top-12 sm:relative sm:-top-16">
              <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center border-4 border-white shadow-md text-3xl font-bold text-[#333333]">
                {formData.displayName.charAt(0)}
              </div>
            </div>
            
            <div className="sm:-mt-4">
              <h2 className="text-xl font-bold text-[#333333] mb-6">Información General</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-[#333333] mb-2">Nombre del Negocio</label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(51,51,51,0.72)]" />
                    <input 
                      type="text" 
                      value={formData.displayName}
                      onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                      maxLength={80}
                      className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-[rgba(26,60,110,0.18)] rounded-xl focus:ring-2 focus:ring-[#00D4FF]/25 focus:bg-white focus:outline-none transition-all text-sm font-medium text-[#333333]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#333333] mb-2">Categoría Principal</label>
                  <div className="relative">
                    <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(51,51,51,0.72)]" />
                    <select 
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-[rgba(26,60,110,0.18)] rounded-xl focus:ring-2 focus:ring-[#00D4FF]/25 focus:bg-white focus:outline-none transition-all text-sm font-medium text-[#333333] appearance-none"
                    >
                      <option value="Diseño Gráfico">Diseño Gráfico</option>
                      <option value="Desarrollo Web">Desarrollo Web</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Electricidad">Electricidad</option>
                      <option value="Limpieza">Limpieza</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#333333] mb-2">Ciudad / Departamento</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(51,51,51,0.72)]" />
                    <select 
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-[rgba(26,60,110,0.18)] rounded-xl focus:ring-2 focus:ring-[#00D4FF]/25 focus:bg-white focus:outline-none transition-all text-sm font-medium text-[#333333] appearance-none"
                    >
                      <option value="Managua">Managua</option>
                      <option value="León">León</option>
                      <option value="Granada">Granada</option>
                      <option value="Estelí">Estelí</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#333333] mb-2">Teléfono (WhatsApp)</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(51,51,51,0.72)]" />
                    <input 
                      type="text" 
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      maxLength={30}
                      className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-[rgba(26,60,110,0.18)] rounded-xl focus:ring-2 focus:ring-[#00D4FF]/25 focus:bg-white focus:outline-none transition-all text-sm font-medium text-[#333333]"
                    />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <div className="flex justify-between items-end mb-2">
                    <label className="block text-sm font-bold text-[#333333]">Biografía / Acerca de</label>
                    <button 
                      onClick={handleEnhanceBio}
                      disabled={isEnhancing || formData.bio.length < 10}
                      className="text-xs font-bold bg-[#F9ECD9] text-[#1A3C6E] hover:bg-[#F9ECD9] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {showEnhanceSuccess ? (
                         <><Check className="w-3.5 h-3.5" /> ¡Mejorado!</>
                      ) : (
                         <><Sparkles className="w-3.5 h-3.5" /> {isEnhancing ? "Mejorando..." : "Mejorar con IA"}</>
                      )}
                    </button>
                  </div>
                  <textarea 
                    value={formData.bio}
                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                    rows={4}
                    maxLength={2000}
                    className="w-full p-4 bg-[#F8F9FA] border border-[rgba(26,60,110,0.18)] rounded-xl focus:ring-2 focus:ring-[#00D4FF]/25 focus:bg-white focus:outline-none transition-all text-[15px] leading-relaxed font-medium text-[#333333] resize-none"
                  ></textarea>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="px-6 py-3 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-70 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saveMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-[#1A3C6E] text-white p-6 rounded-3xl border border-[#1A3C6E] shadow-xl">
             <div className="text-[rgba(51,51,51,0.72)] text-sm font-bold uppercase tracking-wider mb-2">Total Cotizaciones</div>
             <div className="text-3xl font-bold">{quotes.length}</div>
          </div>
           <div className="bg-white p-6 rounded-3xl border border-[rgba(26,60,110,0.18)] shadow-sm">
             <div className="text-[rgba(51,51,51,0.72)] text-sm font-bold uppercase tracking-wider mb-2">Trust Score</div>
             <div className="text-3xl font-bold text-[var(--brand)]">{provider?.score || 0}</div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-[rgba(26,60,110,0.18)] shadow-sm">
             <div className="text-[rgba(51,51,51,0.72)] text-sm font-bold uppercase tracking-wider mb-2">Perfil comercial</div>
             <div className="text-sm font-bold text-[#333333] mt-2 flex items-center gap-2">
               <Building className="w-5 h-5 text-[#1B6E3A]" /> Información pública activa
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
