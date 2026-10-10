import React, { useState } from 'react';
import { saveRuntimeSupabaseConfig, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { GraduationCap, Database, Key, CheckCircle2, AlertTriangle, ArrowRight, Copy } from 'lucide-react';
import { toast } from 'sonner';

export const SetupSupabaseScreen: React.FC = () => {
  const [url, setUrl] = useState(supabaseUrl || '');
  const [key, setKey] = useState(supabaseAnonKey || '');
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim().startsWith('https://')) {
      toast.error('Supabase URL must start with https://');
      return;
    }
    if (key.trim().length < 20) {
      toast.error('Please enter a valid Supabase anon/publishable key');
      return;
    }
    saveRuntimeSupabaseConfig(url.trim(), key.trim());
  };

  const copyEnvSnippet = () => {
    const snippet = `VITE_SUPABASE_URL="${url || 'https://your-project-id.supabase.co'}"\nVITE_SUPABASE_PUBLISHABLE_KEY="${key || 'your-anon-or-publishable-key'}"`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success('Copied .env template to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFD] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ClassFlow Configuration</h1>
              <p className="text-blue-100 text-xs">Connect your Supabase project to activate the classroom platform</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-8 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold">CRITICAL SUPABASE REQUIREMENTS:</p>
              <p>1. <strong>Disable Confirm Email:</strong> In Supabase Dashboard → Authentication → Providers → Email, turn off <em>&quot;Confirm email&quot;</em>. This is required because registration returns an active session immediately.</p>
              <p>2. <strong>Run Migrations:</strong> Execute files in <code>supabase/migrations/</code> (001 through 005) in your Supabase SQL Editor.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-gray-400" />
                Supabase Project URL
              </label>
              <input
                type="text"
                required
                placeholder="https://xyzcompany.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-gray-400" />
                Supabase Anon / Publishable API Key
              </label>
              <input
                type="password"
                required
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Found in your Supabase Project Settings → API → Project API Keys (anon public)
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={copyEnvSnippet}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied .env' : 'Copy for .env'}</span>
              </button>

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow transition-all"
              >
                <span>Save & Connect</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
