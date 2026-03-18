import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  passwordHash: { type: String, required: true },
  plan: { type: String, default: 'free' },
  avatarUrl: { type: String, default: '' }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
