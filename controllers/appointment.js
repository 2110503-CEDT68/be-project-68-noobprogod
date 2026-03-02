const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');


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