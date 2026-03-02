const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');

/**
 * Validate appointment date
 * - Cannot be more than 2 weeks in advance
 * - Must be within business hours 09:00-17:00 (Thailand time)
 */
function validateAppointmentDate(apptDate) {
    const appointmentDate = new Date(apptDate);
    const now = new Date();
    
    // Check if date is in the past
    if (appointmentDate < now) {
        return { error: 'Appointment date cannot be in the past' };
    }
    
    // Check if date is more than 2 weeks in advance
    const twoWeeksFromNow = new Date(now);
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
    if (appointmentDate > twoWeeksFromNow) {
        return { error: 'Cannot book more than 2 weeks in advance' };
    }
    
    // Check business hours 09:00-17:00 (Thailand time, UTC+7)
    const thailandDate = new Date(appointmentDate.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const hour = thailandDate.getHours();
    
    if (hour < 9 || hour >= 17) {
        return { error: 'Appointments can only be booked between 09:00 and 17:00 (Thailand time)' };
    }
    
    return { error: null };
}


//@desc Get all appointments 
//@route GET /api/v1/appointments
//@access Private
exports.getAppointments = async (req, res, next) => {
    let query;

    if (req.user.role !== 'admin') {
        // regular user: only own booking
        query = Appointment.find({ user: req.user.id }).populate({
            path: 'dentist',
            select: 'name yearsOfExperience expertise'
        });
    } else {
        // admin can view all or filter by dentist via nested route
        if (req.params.dentistId) {
            query = Appointment.find({ dentist: req.params.dentistId }).populate({
                path: 'dentist',
                select: 'name yearsOfExperience expertise'
            });
        } else {
            query = Appointment.find().populate({
                path: 'dentist',
                select: 'name yearsOfExperience expertise'
            });
        }
    }

    try {
        const appointments = await query;
        res.status(200).json({
            success: true,
            count: appointments.length,
            data: appointments
        });
    } catch (err) {
        console.error(err.stack);
        return res.status(500).json({
            success: false,
            message: 'Cannot fetch appointments'
        });
    }
};


//@desc Get single appointment
//@route GET /api/v1/appointments/:id
//@access Private
exports.getAppointment = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.id).populate({
            path: 'dentist',
            select: 'name yearsOfExperience expertise'
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: `No appointment with the id of ${req.params.id}`
            });
        }

        res.status(200).json({ success: true, data: appointment });
    } catch (err) {
        console.error(err.stack);
        return res.status(500).json({
            success: false,
            message: 'Cannot find appointment'
        });
    }
};
    
//@desc Add single appointment
//@route POST /api/v1/dentists/:dentistId/appointments
//@access Private
exports.addAppointment = async (req, res, next) => {
    try {
        // attach the dentist and user
        req.body.dentist = req.params.dentistId;
        req.body.user = req.user.id;

        const dentist = await Dentist.findById(req.params.dentistId);
        if (!dentist) {
            return res.status(404).json({
                success: false,
                message: `No dentist with id of ${req.params.dentistId}`
            });
        }

        // ensure one booking per normal user
        if (req.user.role !== 'admin') {
            const existing = await Appointment.findOne({ user: req.user.id });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'User has already booked a session. Only one booking allowed.'
                });
            }
        }

        // Validate appointment date
        const { error: validationError } = validateAppointmentDate(req.body.apptDate);
        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        // Check if dentist already has an appointment at the same time
        const conflictingAppt = await Appointment.findOne({
            dentist: req.params.dentistId,
            apptDate: req.body.apptDate
        });
        if (conflictingAppt) {
            return res.status(400).json({
                success: false,
                message: 'This dentist already has an appointment at that time'
            });
        }

        // Check booking limit per day if set
        if (dentist.bookingLimitPerDay) {
            const appointmentDate = new Date(req.body.apptDate);
            const dayStart = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());
            const dayEnd = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate() + 1);
            
            const bookingsOnDay = await Appointment.countDocuments({
                dentist: req.params.dentistId,
                apptDate: { $gte: dayStart, $lt: dayEnd }
            });
            
            if (bookingsOnDay >= dentist.bookingLimitPerDay) {
                return res.status(400).json({
                    success: false,
                    message: `Dentist has reached the booking limit of ${dentist.bookingLimitPerDay} for this day`
                });
            }
        }

        const appointment = await Appointment.create(req.body);
        res.status(201).json({ success: true, data: appointment });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Cannot create appointment'
        });
    }
};


//@desc Update appointment
//@route PUT /api/v1/appointments/:id
//@access Private
exports.updateAppointment = async (req, res, next) => {
    try {
        let appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: `No appointment with id ${req.params.id}`
            });
        }

        if (
            appointment.user.toString() !== req.user.id &&
            req.user.role !== 'admin'
        ) {
            return res.status(401).json({
                success: false,
                message: `User ${req.user.id} not authorized to update this appointment`
            });
        }

        // Validate appointment date if being updated
        if (req.body.apptDate) {
            const { error: validationError } = validateAppointmentDate(req.body.apptDate);
            if (validationError) {
                return res.status(400).json({
                    success: false,
                    message: validationError
                });
            }

            // Check if dentist already has an appointment at the new time (excluding current appointment)
            const conflictingAppt = await Appointment.findOne({
                _id: { $ne: req.params.id },
                dentist: appointment.dentist,
                apptDate: req.body.apptDate
            });
            if (conflictingAppt) {
                return res.status(400).json({
                    success: false,
                    message: 'This dentist already has an appointment at that time'
                });
            }

            // Check booking limit per day if set
            const dentist = await Dentist.findById(appointment.dentist);
            if (dentist && dentist.bookingLimitPerDay) {
                const appointmentDate = new Date(req.body.apptDate);
                const dayStart = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());
                const dayEnd = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate() + 1);
                
                const bookingsOnDay = await Appointment.countDocuments({
                    _id: { $ne: req.params.id },
                    dentist: appointment.dentist,
                    apptDate: { $gte: dayStart, $lt: dayEnd }
                });
                
                if (bookingsOnDay >= dentist.bookingLimitPerDay) {
                    return res.status(400).json({
                        success: false,
                        message: `Dentist has reached the booking limit of ${dentist.bookingLimitPerDay} for this day`
                    });
                }
            }
        }

        appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        res.status(200).json({ success: true, data: appointment });
    } catch (err) {
        console.error(err.stack);
        return res.status(500).json({
            success: false,
            message: 'Cannot update appointment'
        });
    }
};

//@desc Delete appointment
//@route DELETE /api/v1/appointments/:id
//@access Private
exports.deleteAppointment = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: `No appointment with id ${req.params.id}`
            });
        }

        if (
            appointment.user.toString() !== req.user.id &&
            req.user.role !== 'admin'
        ) {
            return res.status(401).json({
                success: false,
                message: `User ${req.user.id} not authorized to delete this appointment`
            });
        }

        await appointment.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        console.error(err.stack);
        return res.status(500).json({
            success: false,
            message: 'Cannot delete appointment'
        });
    }
};