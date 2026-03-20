import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String, default: '' },
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  contacts: { type: [contactSchema], default: [] },
  legacyUsername: { type: String, default: '' }
}, { timestamps: true });

userSchema.index({ name: 1 });

export const User = mongoose.model('User', userSchema);
