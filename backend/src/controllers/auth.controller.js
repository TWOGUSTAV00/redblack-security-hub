import { getProfile, loginUser, registerUser } from '../auth/auth.service.js';

export async function register(req, res, next) {
  try {
    const payload = await registerUser(req.body);
    res.status(201).json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const payload = await loginUser(req.body);
    res.json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
}

export async function profile(req, res, next) {
  try {
    const user = await getProfile(req.user.id);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}
