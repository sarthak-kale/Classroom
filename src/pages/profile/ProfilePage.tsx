import React, { useState } from 'react';
import { useAuth } from '../../features/auth/AuthContext';
import { supabase, uploadFileToBucket, getPublicFileUrl } from '../../lib/supabase';
import { Avatar } from '../../components/ui/Avatar';
import { User, Mail, Shield, Camera, Save, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export const ProfilePage: React.FC = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !fullName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Profile name updated successfully.');
      await refreshProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WEBP)');
      return;
    }

    if (file.size > 5242880) {
      toast.error('Avatar size limit is 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const storagePath = `${user.id}/avatar_${Date.now()}.${ext}`;

      const { path, error } = await uploadFileToBucket('profile-avatars', storagePath, file);
      if (error) throw error;

      const publicUrl = getPublicFileUrl('profile-avatars', path);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('Avatar updated successfully!');
      await refreshProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Your Profile</h1>
        <p className="text-xs text-gray-500 mt-1">Manage your account identity and personal avatar.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 pb-6 border-b border-gray-100">
          <div className="relative group">
            <Avatar
              name={profile?.full_name || 'User'}
              url={profile?.avatar_url}
              size="xl"
              className="w-24 h-24 text-2xl"
            />
            <label
              htmlFor="avatarUpload"
              className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity backdrop-blur-2xs"
            >
              <Camera className="w-6 h-6" />
              <span className="text-[10px] font-semibold mt-1">Change</span>
            </label>
            <input
              id="avatarUpload"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar}
              className="hidden"
            />
          </div>

          <div className="text-center sm:text-left space-y-1">
            <h3 className="text-lg font-bold text-gray-900">{profile?.full_name}</h3>
            <p className="text-xs text-gray-500">{profile?.email}</p>
            <div className="pt-2 flex items-center justify-center sm:justify-start gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                <Shield className="w-3.5 h-3.5" />
                {profile?.role}
              </span>
              <span className="text-[10px] text-gray-400 italic">Role is immutable</span>
            </div>
          </div>
        </div>

        {/* Update Name Form */}
        <form onSubmit={handleUpdateName} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Email Address (Account Credential)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                disabled
                value={profile?.email || ''}
                className="w-full pl-10 pr-3.5 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Email is tied to your Supabase Auth user record.</p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>

        {/* Sign out section */}
        <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-gray-800">Account Session</h4>
            <p className="text-[11px] text-gray-400">Sign out of your active ClassFlow session on this device.</p>
          </div>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
